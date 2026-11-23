# Firmware ESP32 V5.1 — inicio del sensor
Se conserva el controlador PID, la telemetría USB, los modos PID/PWM fijo, las protecciones y el mapa de pines del V5 original.

## Cambios
- Al recibir RUN o RUN_FOR se descartan el instante y el período de pulso de la marcha anterior, bajo sección crítica.
- El primer pulso posterior a RUN inicializa el instante y el segundo establece un período válido de la prueba nueva.
- La estimación RPM filtrada espera ese período válido en vez de inicializarse con una lectura 0 sin pulsos.
- El contador META de pulsos se reinicia por ensayo.
- La línea de versión serial pasa a VER,FAJA_PID_V5_1.

## Carga
Abrir FAJA_PID_V5_1_SENSOR_INICIO/FAJA_PID_V5_1_SENSOR_INICIO.ino en Arduino IDE, seleccionar la placa ESP32 Dev Module (o la placa DevKit utilizada), configurar el puerto COM correcto y pulsar Subir. El archivo .txt incluye el mismo código y puede copiarse en el IDE o renombrarse a .ino.

El código fue compilado con el núcleo ESP32 Arduino 3.3.13, placa esp32:esp32:esp32. **No se ha probado físicamente en el motor tras la modificación**. Comprobar STOP y sentido del giro antes de ensayos prolongados.

## Modelo teórico de la interfaz
La predicción G(z) no se muestra hasta ingresar K (RPM/duty normalizado) y τ (segundos) o pulsar Usar estimación PWM. La estimación extraída de PWM es preliminar; no debe confundirse con una validación independiente. En lazo abierto no hay referencia de velocidad gobernando el motor, por lo que las métricas PID no corresponden.

Conservar los CSV anteriores y diferenciar los ensayos V5 y V5.1 por la versión del firmware.
