import json
import boto3
from decimal import Decimal
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Key
from botocore.config import Config

REGION = "us-east-1"
DEVICE_ID = "ESP32-CadenaFrio"
TOPIC_CONTROL = "cadena-frio/control"
IOT_ENDPOINT = "a1cgwb7j82vhtb-ats.iot.us-east-1.amazonaws.com"

dynamodb = boto3.resource("dynamodb", region_name=REGION)
tabla = dynamodb.Table("CadenaFrio-Lecturas")

iot = boto3.client(
    "iot-data",
    region_name=REGION,
    endpoint_url="https://" + IOT_ENDPOINT,
    config=Config(
        connect_timeout=3,
        read_timeout=5,
        retries={"max_attempts": 1}
    )
)


def convertir_decimal(valor):
    if isinstance(valor, Decimal):
        return float(valor)
    raise TypeError("Tipo no compatible")


def responder(codigo, datos):
    return {
        "statusCode": codigo,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(datos, default=convertir_decimal)
    }


def consultar_lecturas():
    respuesta = tabla.query(
        KeyConditionExpression=Key("deviceId").eq(DEVICE_ID),
        ScanIndexForward=False,
        Limit=50
    )
    lecturas = respuesta.get("Items", [])
    lecturas.reverse()
    return responder(200, {
        "dispositivo": DEVICE_ID,
        "total": len(lecturas),
        "lecturas": lecturas
    })


def controlar_led(comando):
    if comando not in ("ON", "OFF"):
        return responder(400, {"error": "Comando no valido. Use ON u OFF."})

    iot.publish(
        topic=TOPIC_CONTROL,
        qos=1,
        retain=False,
        payload=comando.encode("utf-8")
    )
    print("Comando MQTT publicado:", comando)
    return responder(200, {
        "mensaje": "Comando enviado a AWS IoT Core",
        "comando": comando,
        "topic": TOPIC_CONTROL,
        "confirmado_por_esp32": False
    })


def lambda_handler(event, context):
    try:
        if not isinstance(event, dict):
            return responder(400, {"error": "Evento no valido"})

        es_api_gateway = (
            event.get("version") == "2.0"
            and isinstance(event.get("requestContext"), dict)
        )

        if es_api_gateway:
            metodo = event.get("requestContext", {}).get("http", {}).get("method")
            ruta = event.get("rawPath")
            if metodo != "POST" or ruta != "/control":
                return responder(404, {"error": "Ruta no disponible"})
            if event.get("isBase64Encoded"):
                return responder(400, {"error": "Cuerpo codificado no admitido"})
            try:
                datos = json.loads(event.get("body") or "{}")
            except (json.JSONDecodeError, TypeError):
                return responder(400, {"error": "El cuerpo debe contener JSON valido"})
            if not isinstance(datos, dict):
                return responder(400, {"error": "Se esperaba un objeto JSON"})
            if datos.get("accion") != "control":
                return responder(400, {"error": "Solo se permite la accion control"})
            comando = datos.get("comando")
        else:
            # Compatibilidad con pruebas directas de Lambda (no es una ruta HTTP).
            accion = event.get("accion", "lecturas")
            if accion == "lecturas":
                return consultar_lecturas()
            if accion != "control":
                return responder(400, {"error": "Accion no reconocida"})
            comando = event.get("comando")

        if not isinstance(comando, str):
            return responder(400, {"error": "Debe indicar un comando"})

        return controlar_led(comando)

    except ClientError as error:
        print("Error AWS:", str(error))
        return responder(500, {"error": "Error al acceder al servicio AWS"})
    except Exception as error:
        print("Error:", str(error))
        return responder(500, {"error": "Error interno de la funcion"})
