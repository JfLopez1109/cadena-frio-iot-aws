
'use strict';

/*
  Cadena de Frío IoT
  Autenticación con Amazon Cognito (OAuth 2.0 + PKCE)
  Control remoto del LED mediante API Gateway y AWS IoT Core.

  Versión publicada en AWS Amplify mediante HTTPS.

  No almacenar claves de AWS, certificados privados,
  contraseñas ni tokens permanentes en este archivo.
*/

(() => {

  // =====================================
  // 1. CONFIGURACIÓN AWS
  // =====================================

  const COGNITO_DOMAIN =
    'https://us-east-1o3bnp6ljy.auth.us-east-1.amazoncognito.com';

  const CLIENT_ID =
    'g3b47di9125hlu3reko829tbb';

  const REDIRECT_URI =
    'https://main.d37dikjh3i2xsi.amplifyapp.com/';

  const CONTROL_API =
    'https://pd0117k07j.execute-api.us-east-1.amazonaws.com/control';

  const AUTH_KEY = 'cadenaFrioAuth';
  const PKCE_KEY = 'cadenaFrioPkce';

  // =====================================
  // 2. ELEMENTOS DEL DASHBOARD
  // =====================================

  const btnOn = document.getElementById('turnOn');
  const btnOff = document.getElementById('turnOff');
  const feedback = document.getElementById('controlFeedback');

  if (!btnOn || !btnOff || !feedback) {
    console.error('No se encontraron los controles del LED.');
    return;
  }

  // =====================================
  // 3. INTERFAZ DE AUTENTICACIÓN
  // =====================================

  const toolbar = document.createElement('div');

  toolbar.style.cssText =
    'display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:12px 0;';

  const loginBtn = document.createElement('button');
  loginBtn.type = 'button';
  loginBtn.textContent = 'Iniciar sesión con Cognito';

  loginBtn.style.cssText =
    'border:1px solid #0d71ee;background:#0d71ee;color:white;border-radius:8px;padding:9px 12px;cursor:pointer;';

  const logoutBtn = document.createElement('button');
  logoutBtn.type = 'button';
  logoutBtn.textContent = 'Cerrar sesión';

  logoutBtn.style.cssText =
    'border:1px solid #9bb3d3;background:white;color:#16447b;border-radius:8px;padding:9px 12px;cursor:pointer;';

  const authStatus = document.createElement('span');

  authStatus.style.cssText =
    'font-size:13px;color:#45658d;';

  toolbar.append(loginBtn, logoutBtn, authStatus);

  btnOn.parentElement.insertBefore(toolbar, btnOn);

  // =====================================
  // 4. COMPROBAR SESIÓN
  // =====================================

  function readAuth() {

    try {
      const auth = JSON.parse(
        sessionStorage.getItem(AUTH_KEY) || 'null'
      );

      if (
        auth &&
        typeof auth.access_token === 'string' &&
        Number.isFinite(auth.expires_at) &&
        Date.now() < auth.expires_at
      ) {
        return auth;
      }

    } catch (error) {
      console.warn('Sesión no válida:', error);
    }

    sessionStorage.removeItem(AUTH_KEY);
    return null;
  }

  // =====================================
  // 5. ACTUALIZAR INTERFAZ
  // =====================================

  function updateUI(message = '') {

    const loggedIn = Boolean(readAuth());

    btnOn.disabled = !loggedIn;
    btnOff.disabled = !loggedIn;

    loginBtn.hidden = loggedIn;
    logoutBtn.hidden = !loggedIn;

    authStatus.textContent = loggedIn
      ? 'Sesión autenticada con Cognito'
      : 'Sin sesión';

    feedback.textContent = message || (
      loggedIn
        ? 'Control autenticado disponible. Puedes enviar ON y OFF.'
        : 'Para controlar el LED, inicia sesión con Cognito.'
    );
  }

  // =====================================
  // 6. CODIFICACIÓN BASE64URL PARA PKCE
  // =====================================

  function base64url(bytes) {

    let binary = '';

    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }

    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  // =====================================
  // 7. INICIAR SESIÓN CON COGNITO
  // =====================================

  async function signIn() {

    const expectedOrigin = new URL(REDIRECT_URI).origin;

    if (location.origin !== expectedOrigin) {

      updateUI(
        'Abre el dashboard desde https://main.d37dikjh3i2xsi.amplifyapp.com/'
      );

      return;
    }

    const verifier = base64url(
      crypto.getRandomValues(new Uint8Array(32))
    );

    const state = base64url(
      crypto.getRandomValues(new Uint8Array(24))
    );

    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(verifier)
    );

    const challenge = base64url(
      new Uint8Array(digest)
    );

    sessionStorage.setItem(
      PKCE_KEY,
      JSON.stringify({
        verifier,
        state
      })
    );

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'openid email',
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state
    });

    location.assign(
      `${COGNITO_DOMAIN}/oauth2/authorize?${params.toString()}`
    );
  }

  // =====================================
  // 8. COMPLETAR INICIO DE SESIÓN
  // =====================================

  async function completeSignIn() {

    const params = new URLSearchParams(location.search);

    const code = params.get('code');
    const error = params.get('error');

    if (!code && !error) return;

    // Retirar el código de autorización de la barra del navegador.
    history.replaceState(
      null,
      '',
      location.pathname + location.hash
    );

    if (error) {
      throw new Error(
        `Cognito rechazó el inicio de sesión: ${error}`
      );
    }

    const stored = JSON.parse(
      sessionStorage.getItem(PKCE_KEY) || 'null'
    );

    sessionStorage.removeItem(PKCE_KEY);

    if (
      !stored ||
      !stored.verifier ||
      !stored.state ||
      stored.state !== params.get('state')
    ) {
      throw new Error(
        'La verificación de seguridad del inicio de sesión falló. Intenta nuevamente.'
      );
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code,
      code_verifier: stored.verifier
    });

    const response = await fetch(
      `${COGNITO_DOMAIN}/oauth2/token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      }
    );

    if (!response.ok) {
      throw new Error(
        `No se pudieron obtener los tokens de Cognito. HTTP ${response.status}`
      );
    }

    const data = await response.json();

    if (
      typeof data.access_token !== 'string' ||
      !Number.isFinite(data.expires_in)
    ) {
      throw new Error(
        'Cognito devolvió una respuesta de autenticación incompleta.'
      );
    }

    sessionStorage.setItem(
      AUTH_KEY,
      JSON.stringify({
        access_token: data.access_token,
        expires_at:
          Date.now() + Math.max(0, data.expires_in - 60) * 1000
      })
    );

    updateUI(
      'Sesión iniciada correctamente. Ya puedes probar el control remoto del LED.'
    );
  }

  // =====================================
  // 9. CONTROL REMOTO DEL LED
  // =====================================

  let sending = false;

  async function sendCommand(command) {

    if (command !== 'ON' && command !== 'OFF') {
      return;
    }

    const auth = readAuth();

    if (!auth) {
      updateUI(
        'Tu sesión ha vencido. Inicia sesión nuevamente.'
      );
      return;
    }

    if (sending) return;

    sending = true;

    btnOn.disabled = true;
    btnOff.disabled = true;

    feedback.textContent =
      `Enviando comando ${command}...`;

    try {

      const response = await fetch(
        CONTROL_API,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${auth.access_token}`
          },
          body: JSON.stringify({
            accion: 'control',
            comando: command
          })
        }
      );

      const raw = await response.text();

      let data = {};

      try {
        data = JSON.parse(raw);
      } catch {
        // Respuesta no JSON.
      }

      if (!response.ok) {

        if (response.status === 401 || response.status === 403) {
          throw new Error(
            'Acceso rechazado. Comprueba la sesión de Cognito.'
          );
        }

        throw new Error(
          `La API respondió HTTP ${response.status}: ${raw.slice(0, 120)}`
        );
      }

      if (data.statusCode && data.statusCode >= 400) {
        throw new Error(
          `La función Lambda devolvió HTTP ${data.statusCode}`
        );
      }

      if (data.comando && data.comando !== command) {
        throw new Error(
          'La API respondió con un comando diferente al solicitado.'
        );
      }

      feedback.textContent =
        `Comando ${command} publicado en AWS IoT Core. Verifica el LED físico.`;

    } catch (error) {

      console.error(
        'Error al controlar el LED:',
        error
      );

      feedback.textContent =
        `Error al enviar ${command}: ${error.message}`;

    } finally {

      sending = false;

      const loggedIn = Boolean(readAuth());

      btnOn.disabled = !loggedIn;
      btnOff.disabled = !loggedIn;
    }
  }

  // =====================================
  // 10. CERRAR SESIÓN
  // =====================================

  function signOut() {

    sessionStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(PKCE_KEY);

    updateUI(
      'Sesión local cerrada correctamente.'
    );
  }

  // =====================================
  // 11. EVENTOS DE LOS BOTONES
  // =====================================

  loginBtn.addEventListener('click', () => {

    signIn().catch(error => {

      console.error(
        'Error al iniciar sesión:',
        error
      );

      updateUI(error.message);
    });
  });

  logoutBtn.addEventListener('click', signOut);

  btnOn.addEventListener('click', () => {
    sendCommand('ON');
  });

  btnOff.addEventListener('click', () => {
    sendCommand('OFF');
  });

  // =====================================
  // 12. INICIALIZACIÓN
  // =====================================

  updateUI();

  completeSignIn().catch(error => {

    console.error(
      'Error al completar el inicio de sesión:',
      error
    );

    updateUI(error.message);
  });

})();
