#include <Arduino.h>
#include <math.h>
#include <esp_arduino_version.h>

// FAJA PID V5.1: corrige inicio del sensor sin cambiar el PID, PWM ni protecciones V5.
// Los eventos de pulso y el filtro de RPM se reinician en cada RUN.
// PROTOTIPO ACADEMICO: ESTOP por software no sustituye interruptor fisico de emergencia.
// No cambiar PPR ni tiempos de filtro sin recalibracion.
// FAJA PID V4: motor TT + sensor TCRT5000 con 1 marca por vuelta.
// Compatible con Faja PID Web: comandos SET, RUN, STOP, PING, RUN_FOR y telemetria DATA.
// Pines: GPIO25 PWM -> XY-MOS; GPIO27 <- OUT TCRT5000; GND comun.
// ADVERTENCIA: mantener un corte fisico de alimentacion del motor.

constexpr uint8_t PIN_PWM = 25, PIN_SENSOR = 27;
constexpr uint32_t PWM_FREQ = 10000, SAMPLE_MS = 100, TELEMETRY_MS = 200;
constexpr uint8_t PWM_BITS = 8;
constexpr int PWM_CHANNEL = 0;
constexpr float TS = 0.1f;
constexpr float PULSES_PER_REV = 1.0f;

// Con referencia maxima de 200 RPM, la vuelta dura 300 ms.
// Se ignoran nuevas marcas antes de 220 ms (rebotes/doble lectura).
constexpr uint32_t MIN_EDGE_GAP_US = 220000UL;
// A velocidades bajas pueden pasar varios segundos entre marcas.
constexpr uint32_t MIN_TIMEOUT_US = 6000000UL;
constexpr uint32_t MAX_TIMEOUT_US = 15000000UL;
constexpr uint32_t STARTUP_GRACE_MS = 8000UL;
constexpr float RPM_FILTER_ALPHA = 0.25f;
constexpr float PWM_RISE_STEP = 12.0f, PWM_FALL_STEP = 8.0f;
// Minimo PROVISIONAL: no garantiza giro bajo carga; calibrar motor real.
constexpr float RUN_MIN_PWM = 18.0f;
constexpr uint32_t LINK_TIMEOUT_MS = 5000UL;
constexpr uint32_t DIAGNOSTIC_MS = 1000UL;
enum ControlMode : uint8_t { MODE_PID = 0, MODE_PWM_FIXED = 1 };

volatile uint32_t lastEdgeUs = 0, edgePeriodUs = 0, acceptedPulseCount = 0;
portMUX_TYPE pulseMux = portMUX_INITIALIZER_UNLOCKED;
float referenceRpm = 120.0f, kp = 0.8f, ki = 0.2f, kd = 0.0f;
float measuredRpm = 0, rawRpm = 0, errorRpm = 0, pwmPct = 0;
float integrator = 0, lastMeasured = 0, filteredDerivative = 0;
bool running = false, fault = false, hasFilteredSample = false;
bool emergencyLatched = false;
ControlMode controlMode = MODE_PID;
float fixedPwmPct = 0.0f;
uint32_t lastCommandMs = 0, lastDiagnosticMs = 0;
uint32_t runStartMs = 0, lastPidMs = 0, lastTelemetryMs = 0;
uint32_t timerStartMs = 0, timerLimitMs = 0;
String rxLine;

void IRAM_ATTR pulseISR() {
  const uint32_t t = micros();
  portENTER_CRITICAL_ISR(&pulseMux);
  const uint32_t dt = t - lastEdgeUs;
  if (lastEdgeUs == 0 || dt >= MIN_EDGE_GAP_US) {
    if (lastEdgeUs != 0) edgePeriodUs = dt;
    lastEdgeUs = t;
    acceptedPulseCount++;
  }
  portEXIT_CRITICAL_ISR(&pulseMux);
}

void setMotor(float percent) {
  percent = constrain(percent, 0.0f, 100.0f);
  pwmPct = percent;
  const uint32_t duty = (uint32_t)lroundf(percent * 255.0f / 100.0f);
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcWrite(PIN_PWM, duty);
#else
  ledcWrite(PWM_CHANNEL, duty);
#endif
}

void haltMotor(bool isFault) {
  running = false;
  fault = isFault;
  timerLimitMs = 0;
  setMotor(0); // STOP y FALLA siempre pueden llevar PWM a cero inmediatamente.
  integrator = 0;
  filteredDerivative = 0;
  errorRpm = 0;
}

bool setConfig(float sp, float p, float i, float d) {
  if (!isfinite(sp) || !isfinite(p) || !isfinite(i) || !isfinite(d)) return false;
  if (sp < 0 || sp > 200 || p < 0 || p > 10 || i < 0 || i > 10 || d < 0 || d > 10) return false;
  referenceRpm = sp;
  kp = p;
  ki = i;
  kd = d;
  filteredDerivative = 0;
  lastMeasured = measuredRpm;
  return true;
}

void resetSensorForNewRun() {
  // El primer flanco tras RUN solo fija la marca de tiempo inicial;
  // el segundo flanco permite calcular un periodo nuevo y verificable.
  // Se descarta el ultimo pulso de la marcha anterior.
  portENTER_CRITICAL(&pulseMux);
  lastEdgeUs = 0;
  edgePeriodUs = 0;
  acceptedPulseCount = 0;
  portEXIT_CRITICAL(&pulseMux);
  rawRpm = 0;
  measuredRpm = 0;
  lastMeasured = 0;
  hasFilteredSample = false;
}

bool startMotor(uint32_t durationMs) {
  if (emergencyLatched) return false;
  haltMotor(false);
  resetSensorForNewRun();
  running = true;
  runStartMs = millis();
  timerStartMs = runStartMs;
  timerLimitMs = durationMs;
  lastMeasured = 0;
  return true;
}

void onCommand(String s) {
  s.trim();
  if (s.length()) lastCommandMs = millis();
  if (s == "ESTOP") {
    emergencyLatched = true;
    haltMotor(true);
    Serial.println("ACK,ESTOP");
  } else if (s == "RESET_ESTOP") {
    if (running) Serial.println("ERR,STOP_FIRST");
    else { emergencyLatched = false; fault = false; Serial.println("ACK,RESET_ESTOP"); }
  } else if (s == "MODE,PID" || s == "MODE,PWM") {
    if (running || emergencyLatched) Serial.println("ERR,STOP_FIRST");
    else { controlMode = s == "MODE,PID" ? MODE_PID : MODE_PWM_FIXED;
           fixedPwmPct = 0; integrator = 0; setMotor(0);
           Serial.println(controlMode == MODE_PID ? "ACK,MODE,PID" : "ACK,MODE,PWM"); }
  } else if (s.startsWith("PWM,")) {
    float v; char extra;
    if (sscanf(s.c_str(), "PWM,%f%c", &v, &extra) != 1 || !isfinite(v) || v < 0 || v > 100) Serial.println("ERR,PARAMS");
    else if (controlMode != MODE_PWM_FIXED || emergencyLatched) Serial.println("ERR,MODE");
    else { fixedPwmPct = v; Serial.printf("ACK,PWM,%.2f\n", v); }
  } else if (s == "STOP" || s == "RUN,0") {
    haltMotor(false);
    Serial.println("ACK,STOP");
  } else if (s == "RUN,1") {
    if (startMotor(0)) Serial.println("ACK,RUN");
    else Serial.println("ERR,ESTOP");
  } else if (s.startsWith("RUN_FOR,")) {
    unsigned long secs = 0;
    char extra;
    const int n = sscanf(s.c_str(), "RUN_FOR,%lu%c", &secs, &extra);
    if (n != 1 || secs < 1 || secs > 3600) Serial.println("ERR,PARAMS");
    else {
      if (startMotor(secs * 1000UL)) Serial.printf("ACK,RUN_FOR,%lu\n", secs);
      else Serial.println("ERR,ESTOP");
    }
  } else if (s.startsWith("SET,")) {
    float v[4];
    char extra;
    const int n = sscanf(s.c_str(), "SET,%f,%f,%f,%f%c", &v[0], &v[1], &v[2], &v[3], &extra);
    if (n == 4 && setConfig(v[0], v[1], v[2], v[3])) Serial.println("ACK,SET");
    else Serial.println("ERR,PARAMS");
  } else if (s == "PING") {
    Serial.println("ACK,PING");
  } else {
    Serial.println("ERR,COMMAND");
  }
}

uint32_t sensorTimeoutUs(uint32_t lastPeriod) {
  // Tiempo valido >= 2.5 vueltas al ritmo observado o de la consigna.
  // Por ejemplo, a 18 RPM cada vuelta dura 3.33 s: esperar al menos 8.33 s.
  const float refPeriod = 60000000.0f / max(referenceRpm, 1.0f);
  float waitUs = 2.5f * max(refPeriod, (float)lastPeriod);
  waitUs = constrain(waitUs, (float)MIN_TIMEOUT_US, (float)MAX_TIMEOUT_US);
  return (uint32_t)waitUs;
}

void sampleSensor() {
  uint32_t e, period;
  portENTER_CRITICAL(&pulseMux);
  e = lastEdgeUs;
  period = edgePeriodUs;
  portEXIT_CRITICAL(&pulseMux);

  const uint32_t age = micros() - e;
  const uint32_t timeoutUs = sensorTimeoutUs(period);
  if (e == 0 || period == 0 || age > timeoutUs) {
    rawRpm = 0;
  } else {
    // Durante la espera entre marcas las RPM no deben aumentar artificialmente.
    const uint32_t effectivePeriod = max(age, period);
    rawRpm = constrain(60000000.0f / (PULSES_PER_REV * (float)effectivePeriod), 0.0f, 250.0f);
  }
  if (!hasFilteredSample) {
    // No inicializar el filtro con un cero de 'sin pulsos'.
    // Esperar un periodo valido entre dos flancos despues de RUN.
    if (e != 0 && period != 0 && age <= timeoutUs) {
      measuredRpm = rawRpm;
      hasFilteredSample = true;
    } else {
      measuredRpm = 0;
    }
  } else {
    measuredRpm += RPM_FILTER_ALPHA * (rawRpm - measuredRpm);
  }
  if (measuredRpm < 0.35f) measuredRpm = 0;
}

void doPid() {
  sampleSensor();
  if (!running) {
    setMotor(0);
    errorRpm = 0;
    lastMeasured = measuredRpm;
    return;
  }
  if (referenceRpm < 1) {
    setMotor(0);
    integrator = 0;
    errorRpm = 0;
    lastMeasured = measuredRpm;
    return;
  }

  uint32_t lastPulse, period;
  portENTER_CRITICAL(&pulseMux);
  lastPulse = lastEdgeUs;
  period = edgePeriodUs;
  portEXIT_CRITICAL(&pulseMux);
  const uint32_t sensorAgeUs = micros() - lastPulse;
  const uint32_t allowedWaitUs = sensorTimeoutUs(period);
  const uint32_t runAgeMs = millis() - runStartMs;

  // Fallar solo ante ausencia prolongada de pulsos REALES, no por un
  // periodo de 3.3 segundos entre dos marcas a RPM bajas.
  if (runAgeMs > STARTUP_GRACE_MS &&
      (lastPulse == 0 || sensorAgeUs > allowedWaitUs)) {
    haltMotor(true);
    Serial.println("FAULT,NO_PULSES");
    return;
  }

  if (controlMode == MODE_PWM_FIXED) {
    errorRpm = 0; // En lazo abierto la referencia RPM no gobierna el motor.
    integrator = 0;
    setMotor(fixedPwmPct); // Escalon directo de PWM para identificacion, solo en modo de ensayo.
    lastMeasured = measuredRpm;
    return;
  }

  errorRpm = referenceRpm - measuredRpm;
  const float derivative = -(measuredRpm - lastMeasured) / TS;
  filteredDerivative = 0.8f * filteredDerivative + 0.2f * derivative;
  lastMeasured = measuredRpm;

  const float candidateI = constrain(integrator + ki * errorRpm * TS, 0.0f, 100.0f);
  const float tentative = kp * errorRpm + candidateI + kd * filteredDerivative;
  if (!((tentative > 100 && errorRpm > 0) || (tentative < 0 && errorRpm < 0))) {
    integrator = candidateI;
  }

  // Solo limitar el PWM durante marcha: STOP, referencia 0 y FALLA
  // mantienen su capacidad de parar el motor completamente.
  const float requested = constrain(kp * errorRpm + integrator + kd * filteredDerivative,
                                    RUN_MIN_PWM, 100.0f);
  const float low = max(RUN_MIN_PWM, pwmPct - PWM_FALL_STEP);
  float high = min(100.0f, pwmPct + PWM_RISE_STEP);
  if (high < low) high = low;
  setMotor(constrain(requested, low, high));
}

void report() {
  Serial.printf("DATA,%lu,%.2f,%.2f,%.2f,%.2f,%d,%d\n",
                (unsigned long)millis(), referenceRpm, measuredRpm, errorRpm,
                pwmPct, running ? 1 : 0, fault ? 1 : 0);
}

void reportDiagnostic() {
  uint32_t edge, period, count;
  portENTER_CRITICAL(&pulseMux);
  edge = lastEdgeUs; period = edgePeriodUs; count = acceptedPulseCount;
  portEXIT_CRITICAL(&pulseMux);
  const uint32_t ageMs = edge ? (uint32_t)((micros() - edge) / 1000UL) : 0;
  Serial.printf("META,%lu,%s,%.2f,%lu,%lu,%lu,%d\n",
    (unsigned long)millis(), controlMode == MODE_PID ? "PID" : "PWM",
    rawRpm, (unsigned long)ageMs, (unsigned long)(period/1000UL),
    (unsigned long)count, emergencyLatched ? 1 : 0);
}

void setup() {
  Serial.begin(115200);
  rxLine.reserve(96);
  pinMode(PIN_SENSOR, INPUT_PULLUP);
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcAttach(PIN_PWM, PWM_FREQ, PWM_BITS);
#else
  ledcSetup(PWM_CHANNEL, PWM_FREQ, PWM_BITS);
  ledcAttachPin(PIN_PWM, PWM_CHANNEL);
#endif
  setMotor(0);
  attachInterrupt(digitalPinToInterrupt(PIN_SENSOR), pulseISR, FALLING);
  lastPidMs = millis();
  lastTelemetryMs = millis();
  lastDiagnosticMs = millis();
  lastCommandMs = millis();
  Serial.println("READY,FAJA_PID_V2"); // Compatibilidad con HMI V2.3.
  Serial.println("CAPS,TIMER");
  Serial.println("CAPS,MODE_PWM,META,ESTOP,LINK_WATCHDOG");
  Serial.println("VER,FAJA_PID_V5_1");
}

void loop() {
  while (Serial.available()) {
    const char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (rxLine.length()) { onCommand(rxLine); rxLine = ""; }
    } else if (rxLine.length() < 95) {
      rxLine += c;
    } else {
      rxLine = "";
    }
  }
  const uint32_t now = millis();
  if (running && (uint32_t)(now - lastCommandMs) > LINK_TIMEOUT_MS) {
    haltMotor(true);
    Serial.println("FAULT,LINK_TIMEOUT");
  }
  if (running && timerLimitMs > 0 && (uint32_t)(now - timerStartMs) >= timerLimitMs) {
    haltMotor(false);
    Serial.println("ACK,TIMER_DONE");
  }
  if (now - lastPidMs >= SAMPLE_MS) { lastPidMs += SAMPLE_MS; doPid(); }
  if (now - lastTelemetryMs >= TELEMETRY_MS) { lastTelemetryMs = now; report(); }
  if (now - lastDiagnosticMs >= DIAGNOSTIC_MS) { lastDiagnosticMs = now; reportDiagnostic(); }
}