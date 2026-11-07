#pragma once

// Copiar este archivo como certificados.h.
// Completarlo ÚNICAMENTE en el entorno local.
// Nunca subir certificados de dispositivo ni claves privadas.

const char* AWS_ROOT_CA = R"EOF(
PEGAR_CERTIFICADO_RAIZ_AMAZON
)EOF";

const char* AWS_DEVICE_CERT = R"EOF(
PEGAR_CERTIFICADO_DEL_DISPOSITIVO
)EOF";

const char* AWS_PRIVATE_KEY = R"EOF(
PEGAR_CLAVE_PRIVADA_DEL_DISPOSITIVO
)EOF";
