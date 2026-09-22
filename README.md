# Rifero — Rifa escolar reutilizable

Aplicación web para administrar rifas escolares: vendedores con PIN propio, números disponibles/reservados/vendidos, comprobantes para WhatsApp, premios, respaldos y personalización visual.

- Sitio: https://rifa-sexto.abraham-medina.chatgpt.site
- Dominio personalizado: https://rifa6grado.islgsanluis.com.ar

## Funciones principales

- Acceso público sin cuenta de ChatGPT.
- Vendedores asociados al nombre del alumno.
- Límites por cantidad máxima o por rango de números.
- Comprobante compartible por WhatsApp como imagen o texto.
- Panel administrador para configuración, premios, vendedores, números y diseño.
- Reinicio de ventas de prueba o reinicio total.
- Respaldo JSON completo y exportación CSV de ventas.
- Persistencia en Cloudflare D1 mediante OpenAI Sites.

## Desarrollo

```bash
npm install
npm run db:generate
npm run build
```

La publicación en OpenAI Sites usa `.openai/hosting.json` y las migraciones versionadas en `drizzle/`.

> No se incluyen claves, PIN ni datos reales en este repositorio.
