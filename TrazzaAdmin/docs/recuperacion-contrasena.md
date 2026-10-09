# Recuperación de contraseña

Flujo: /login → /recuperar-contrasena → correo de Supabase →
/auth/recuperacion → /restablecer-contrasena → nueva contraseña → /login.
No se modificaron las variables de entorno ni se requieren migraciones.

## Configuración necesaria en Supabase

En Authentication → URL Configuration, agregar a Redirect URLs:

- http://localhost:3000/auth/recuperacion
- La URL HTTPS del despliegue seguida de /auth/recuperacion.
- Si se prueba desde otro equipo en la red, su URL de acceso seguida de
  /auth/recuperacion (localhost en ese equipo no apunta al servidor).

En Authentication → Email Templates → Reset Password, la plantilla estándar
con {{ .ConfirmationURL }} funciona con PKCE. Se debe abrir el enlace en el
mismo navegador y origen desde donde se solicitó: allí está el verificador.

Opcionalmente, para admitir otro navegador, usar el enlace de verificación de
token de recuperación recomendado para SSR:

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery">Restablecer contraseña</a>
```

El handler acepta únicamente type=recovery para token_hash. No admite destinos
de redirección suministrados por el usuario. Supabase verifica expiración y uso
único. La pantalla exige una sesión verificada; una sesión autenticada existente
también puede cambiar su contraseña, según las políticas de Supabase.

Configurar Custom SMTP para correos a usuarios reales. El servicio de prueba de
Supabase tiene restricciones de destinatarios y límites de envío. No introducir
claves SMTP en el frontend.

## Pruebas con una cuenta propia

1. Cerrar sesión. Solicitar un enlace desde el login con un correo registrado.
2. Abrir el correo en el mismo navegador y comprobar la pantalla de nueva clave.
3. Comprobar que menos de 8 caracteres o confirmación diferente no se guardan.
4. Guardar una contraseña válida; comprobar confirmación e iniciar sesión con ella.
5. Verificar que la contraseña anterior ya no permite entrar.
6. Abrir nuevamente el enlace usado: debe pedir uno nuevo. Probar enlace expirado.
7. Entrar directamente sin sesión a /restablecer-contrasena: no debe mostrar el formulario.
8. Solicitar un correo inexistente: el mensaje no debe revelar si existe la cuenta.
9. Comprobar la recuperación en el dominio publicado y sus URLs permitidas.

Referencias: https://supabase.com/docs/guides/auth/passwords y
https://supabase.com/docs/guides/auth/auth-email-templates.
