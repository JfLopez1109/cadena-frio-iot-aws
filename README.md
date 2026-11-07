# Cadena de Frío IoT — ESP32 + AWS

Sistema académico de monitoreo de temperatura y humedad para cadena de frío de medicamentos y vacunas, con visualización web y control remoto autenticado de un LED integrado en una ESP32.

**Dashboard HTTPS:** https://main.d37dikjh3i2xsi.amplifyapp.com/

> Proyecto desarrollado para una práctica de Internet de las Cosas. Es un prototipo educativo, no un dispositivo de monitoreo médico certificado. La aplicación pública permite consultar mediciones; el control del actuador requiere iniciar sesión con Amazon Cognito.

## Características

- Sensor **DHT22** conectado al **GPIO 4** de una ESP32.
- Envío periódico de temperatura, humedad y estado de alerta mediante **MQTT sobre TLS** hacia AWS IoT Core.
- Rango de referencia configurado: **2 °C a 8 °C**. Fuera de ese intervalo se marca alerta.
- Almacenamiento de lecturas en **Amazon DynamoDB**.
- Consulta de las **50 lecturas recientes** mediante AWS Lambda.
- Dashboard con tarjetas, gráfica histórica, alertas y descarga **CSV**.
- Inicio de sesión con **Amazon Cognito (OAuth 2.0 con PKCE)**.
- **Amazon API Gateway (HTTP API con autorizador JWT)** para autorizar las solicitudes de control.
- Encendido y apagado remoto del LED del **GPIO 2** a través de AWS Lambda y mensajes MQTT `ON` / `OFF`.
- Sitio alojado mediante **AWS Amplify Hosting (HTTPS)**. También se utilizó Amazon S3 para los archivos estáticos y su despliegue.

## Arquitectura

### Monitoreo de datos

```text
DHT22 (GPIO 4) → ESP32 → MQTT/TLS → AWS IoT Core
                                       ↓
                                Regla IoT Core
                                       ↓
                                   DynamoDB
                                       ↓
                            Lambda LecturasPublicas
                                       ↓
                          Dashboard HTTPS (Amplify)
```

### Control remoto autenticado

```text
Usuario → Dashboard HTTPS → Amazon Cognito
                               ↓
                        Token de acceso
                               ↓
                 API Gateway (JWT) POST /control
                               ↓
                       Lambda CadenaFrio_API
                               ↓
                AWS IoT Core: cadena-frio/control
                               ↓
                      ESP32 → LED GPIO 2
```

El mensaje que recibe la ESP32 es texto plano: `ON` o `OFF`. Una respuesta HTTP exitosa confirma el envío del comando desde el backend, **no necesariamente su ejecución física**; esta se verifica en el Monitor Serie y el LED.

## Organización del repositorio

```text
dashboard/
  index.html                  Interfaz del dashboard
  style.css                   Estilos
  app.js                      Consultas, gráfica, tabla y CSV
  auth-control.js             Cognito, PKCE y comandos autenticados
esp32/
  sketch_nov4a.ino            Firmware ESP32
  secrets.example.h           Plantilla de Wi-Fi, AWS y tópicos
  certificados.example.h      Plantilla para certificados TLS
lambda/
  CadenaFrio_LecturasPublicas.py  Consulta DynamoDB
  CadenaFrio_API.py               Control MQTT y pruebas directas
.gitignore
README.md
```

## Preparación de la ESP32

**Hardware:** ESP32 Dev Module, sensor DHT22 en GPIO 4, alimentación y resistencia de pull-up según el módulo/sensor empleado. El actuador utilizado en la práctica es el LED integrado en GPIO 2, disponible según la placa.

**Software:** Arduino IDE con soporte para ESP32 y bibliotecas `WiFi`, `WiFiClientSecure`, `PubSubClient` y `DHT sensor library`.

1. Copiar `esp32/secrets.example.h` como **`secrets.h`** y configurar la red Wi-Fi, el endpoint **Data-ATS** de AWS IoT Core, el identificador MQTT y los tópicos.
2. Copiar `esp32/certificados.example.h` como **`certificados.h`** y agregar localmente el certificado raíz, el certificado del dispositivo y su clave privada.
3. Mantener esos dos archivos reales **fuera de Git y de cualquier publicación**.
4. Abrir `sketch_nov4a.ino`, seleccionar la placa y el puerto, compilar y cargar.
5. Abrir Monitor Serie a **115200 baudios** y verificar conexión Wi-Fi, conexión MQTT, publicación de datos y suscripción al tópico `cadena-frio/control`.

La frecuencia de medición definida en el firmware es **5 segundos**. El tópico de datos es `cadena-frio/datos` y el tópico de control es `cadena-frio/control`.

## Configuración de AWS (resumen)

Esta implementación de ejemplo utiliza la región `us-east-1`. Los nombres, endpoints, autorizaciones y políticas deben ajustarse a cada cuenta:

1. **AWS IoT Core:** crear un Thing, certificado y política de mínimos permisos para conectar, publicar en el tópico de datos y suscribirse/recibir comandos en el tópico de control.
2. **DynamoDB:** crear `CadenaFrio-Lecturas` con claves `deviceId` y `timestamp`; configurar una regla de IoT Core para registrar cada medición, añadiendo el ID del dispositivo y la marca de tiempo.
3. **Lambda de lecturas:** desplegar `CadenaFrio_LecturasPublicas.py` con permisos de lectura de DynamoDB y configurar su URL pública **solo para consulta**, con CORS según el origen del dashboard.
4. **Lambda de control:** desplegar `CadenaFrio_API.py` con permisos específicos para publicar en `cadena-frio/control`. Ajustar `IOT_ENDPOINT` al endpoint de datos de la cuenta.
5. **Cognito:** configurar un User Pool y cliente SPA público, inicio de sesión con código de autorización y PKCE, y URL de retorno HTTPS autorizada.
6. **API Gateway:** crear una HTTP API con `POST /control`, integración con la Lambda de control, **autorizador JWT** de Cognito, audiencia del cliente y CORS para el origen HTTPS del sitio.
7. **Frontend:** revisar las constantes `READINGS_API_URL` en `dashboard/app.js` y `COGNITO_DOMAIN`, `CLIENT_ID`, `REDIRECT_URI`, `CONTROL_API` en `dashboard/auth-control.js`. Esas URL e identificadores son públicos; nunca insertar claves privadas o credenciales de AWS en JavaScript.
8. **Hosting:** publicar los archivos de `dashboard/` mediante Amplify Hosting con HTTPS. Para la práctica se utilizó un prefijo de S3 con los cuatro archivos en la raíz del prefijo.

**Nota de seguridad:** un origen CORS autorizado **no equivale a autenticación**. La ruta de control debe conservar su autorizador JWT; la Lambda pública de lecturas no debe aceptar comandos. Utilizar permisos IAM mínimos en lugar de roles generales del laboratorio para un entorno real.

## Pruebas funcionales realizadas

- Se recibieron mediciones del DHT22 en AWS IoT Core y se consultaron registros de DynamoDB.
- El dashboard HTTPS mostró temperatura, humedad, alertas e historial.
- Se probó el inicio de sesión con Cognito desde la página HTTPS.
- Se verificó **encendido y apagado físicos del LED** desde los botones del dashboard publicado, observando el dispositivo y el Monitor Serie.

## Consideraciones

- El rango **2–8 °C** es un criterio de alerta del prototipo, no una garantía de conservación de medicamentos.
- El firmware incluye una opción de simulación (`USAR_SENSOR = false`), mientras que las pruebas compartidas se realizaron usando el sensor DHT22.
- El código de Lambda es una referencia del desarrollo; para reproducir toda la infraestructura se requieren configurar recursos, reglas IoT, permisos IAM, APIs y Cognito en AWS.
- Evitar publicar capturas de credenciales temporales, tokens de sesión, certificados privados o contraseñas.
- Revisar consumo y recursos de AWS Academy al terminar las prácticas. Eliminar los recursos que ya no se necesiten según las instrucciones del laboratorio.
