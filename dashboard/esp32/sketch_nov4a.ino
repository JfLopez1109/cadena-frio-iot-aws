
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include "DHT.h"
#include "secrets.h"
#include "certificados.h"

// =====================================
// SENSOR DHT22
// =====================================

#define DHTPIN 4
#define DHTTYPE DHT22

DHT dht(DHTPIN, DHTTYPE);

// =====================================
// ACTUADOR: LED INTEGRADO
// =====================================

#define LED_PIN 2

bool estadoLED = false;

// =====================================
// CONFIGURACION
// =====================================

const bool USAR_SENSOR = true;
const unsigned long INTERVALO = 5000;

unsigned long ultimaLectura = 0;
unsigned long ultimoIntentoWiFi = 0;
unsigned long ultimoIntentoMQTT = 0;

// =====================================
// CLIENTE MQTT SEGURO
// =====================================

WiFiClientSecure secureClient;
PubSubClient mqtt(secureClient);

// =====================================
// RECIBIR COMANDOS MQTT
// =====================================

void recibirMensaje(char* topic,
                    byte* payload,
                    unsigned int length) {

  String mensaje = "";

  for (unsigned int i = 0; i < length; i++) {
    mensaje += (char)payload[i];
  }

  mensaje.trim();
  mensaje.toUpperCase();

  Serial.println();
  Serial.println("===== COMANDO RECIBIDO =====");

  Serial.print("Topic: ");
  Serial.println(topic);

  Serial.print("Mensaje: ");
  Serial.println(mensaje);

  if (String(topic) == TOPIC_CONTROL) {

    if (mensaje == "ON") {

      digitalWrite(LED_PIN, HIGH);
      estadoLED = true;

      Serial.println("LED ENCENDIDO DESDE AWS");

    } else if (mensaje == "OFF") {

      digitalWrite(LED_PIN, LOW);
      estadoLED = false;

      Serial.println("LED APAGADO DESDE AWS");

    } else {

      Serial.println("Comando no reconocido");
    }
  }
}

// =====================================
// CONECTAR WIFI
// =====================================

void conectarWiFi() {

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Conectando al WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi conectado correctamente");

  Serial.print("Direccion IP: ");
  Serial.println(WiFi.localIP());
}

// =====================================
// CONECTAR AWS IOT CORE
// =====================================

void conectarAWS() {

  if (WiFi.status() != WL_CONNECTED) return;
  if (mqtt.connected()) return;

  unsigned long ahora = millis();

  if (ultimoIntentoMQTT != 0 &&
      ahora - ultimoIntentoMQTT < INTERVALO) {
    return;
  }

  ultimoIntentoMQTT = ahora;

  Serial.println("Conectando a AWS IoT Core...");

  if (mqtt.connect(MQTT_CLIENT_ID)) {

    Serial.println("MQTT conectado correctamente");

    // Suscribirse al topic de control remoto
    if (mqtt.subscribe(TOPIC_CONTROL)) {

      Serial.println(
        "Suscrito a cadena-frio/control"
      );

    } else {

      Serial.println(
        "Error al solicitar suscripcion MQTT"
      );
    }

  } else {

    Serial.print("Error MQTT. Estado: ");
    Serial.println(mqtt.state());
  }
}

// =====================================
// CONFIGURACION INICIAL
// =====================================

void setup() {

  Serial.begin(115200);

  // Inicializar sensor DHT22
  dht.begin();

  // Configurar primero GPIO 2 como salida
  pinMode(LED_PIN, OUTPUT);

  // Establecer el estado inicial del LED
  digitalWrite(LED_PIN, LOW);
  estadoLED = false;

  Serial.println();
  Serial.println("==============================");
  Serial.println(" CADENA DE FRIO - ACTIVIDAD 3");
  Serial.println(" SENSOR + MQTT + ACTUADOR");
  Serial.println("==============================");

  // Conectar WiFi
  conectarWiFi();

  // Configurar certificados TLS
  secureClient.setCACert(AWS_ROOT_CA);
  secureClient.setCertificate(AWS_DEVICE_CERT);
  secureClient.setPrivateKey(AWS_PRIVATE_KEY);

  // Configurar servidor MQTT
  mqtt.setServer(AWS_ENDPOINT, AWS_PORT);
  mqtt.setBufferSize(512);
  mqtt.setSocketTimeout(3);

  // Registrar funcion que recibe comandos
  mqtt.setCallback(recibirMensaje);

  // Conectar con AWS IoT Core
  conectarAWS();
}

// =====================================
// CICLO PRINCIPAL
// =====================================

void loop() {

  // Verificar conexion WiFi
  if (WiFi.status() != WL_CONNECTED) {

    if (millis() - ultimoIntentoWiFi >= INTERVALO) {

      ultimoIntentoWiFi = millis();

      Serial.println("Reconectando WiFi...");
      WiFi.reconnect();
    }

    return;
  }

  // Verificar conexion MQTT
  if (!mqtt.connected()) {

    conectarAWS();
    return;
  }

  // Mantener conexion y recibir comandos
  mqtt.loop();

  // Controlar intervalo de lectura
  if (millis() - ultimaLectura < INTERVALO) {
    return;
  }

  ultimaLectura = millis();

  float temperatura;
  float humedad;

  // =====================================
  // LEER SENSOR DHT22
  // =====================================

  if (USAR_SENSOR) {

    temperatura = dht.readTemperature();
    humedad = dht.readHumidity();

    if (isnan(temperatura) || isnan(humedad)) {

      Serial.println("Error leyendo DHT22");
      return;
    }

  } else {

    temperatura = random(20, 110) / 10.0;
    humedad = random(400, 700) / 10.0;
  }

  // =====================================
  // VERIFICAR ALERTA
  // =====================================

  bool alerta = temperatura < 2.0 ||
                temperatura > 8.0;

  // =====================================
  // CREAR JSON
  // =====================================

  String mensaje = "{";

  mensaje += "\"temperatura\":";
  mensaje += String(temperatura, 2);

  mensaje += ",\"humedad\":";
  mensaje += String(humedad, 2);

  mensaje += ",\"alerta\":";
  mensaje += (alerta ? "true" : "false");

  mensaje += "}";

  // =====================================
  // MOSTRAR RESULTADOS
  // =====================================

  Serial.println();
  Serial.println("------------------------------");

  Serial.print("Temperatura: ");
  Serial.print(temperatura, 2);
  Serial.println(" C");

  Serial.print("Humedad: ");
  Serial.print(humedad, 2);
  Serial.println(" %");

  Serial.print("Estado: ");
  Serial.println(alerta ? "ALERTA" : "NORMAL");

  Serial.print("LED: ");
  Serial.println(estadoLED ? "ENCENDIDO" : "APAGADO");

  Serial.print("JSON: ");
  Serial.println(mensaje);

  // =====================================
  // PUBLICAR DATOS EN AWS
  // =====================================

  bool publicado = mqtt.publish(
    TOPIC_DATOS,
    mensaje.c_str()
  );

  if (publicado) {

    Serial.println(
      "Mensaje MQTT publicado correctamente"
    );

  } else {

    Serial.println("Error al publicar MQTT");
  }

  Serial.println("------------------------------");
}
