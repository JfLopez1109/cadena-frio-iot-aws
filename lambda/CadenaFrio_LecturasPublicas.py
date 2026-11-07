import json
import boto3
from decimal import Decimal
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
tabla = dynamodb.Table("CadenaFrio-Lecturas")
DEVICE_ID = "ESP32-CadenaFrio"


def convertir_decimal(valor):
    if isinstance(valor, Decimal):
        return float(valor)
    raise TypeError("Tipo no compatible")


def lambda_handler(event, context):
    try:
        respuesta = tabla.query(
            KeyConditionExpression=Key("deviceId").eq(DEVICE_ID),
            ScanIndexForward=False,
            Limit=50
        )

        lecturas = respuesta.get("Items", [])
        lecturas.reverse()
        datos = []

        for lectura in lecturas:
            datos.append({
                "timestamp": lectura.get("timestamp"),
                "temperatura": lectura.get("temperatura"),
                "humedad": lectura.get("humedad"),
                "alerta": lectura.get("alerta", False)
            })

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({
                "dispositivo": DEVICE_ID,
                "total": len(datos),
                "lecturas": datos
            }, default=convertir_decimal)
        }

    except Exception as error:
        print("Error:", str(error))
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "No se pudieron consultar las lecturas"})
        }
