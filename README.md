# VORTA · Embedded Signup de WhatsApp

Alta de clientes por **Embedded Signup** (modelo Tech Provider). Cada cliente conecta
su propio número oficial de Meta en su portafolio, y VORTA lo opera desde un hub central.

## Estructura

```
vorta-metawhatsapp/
├── web/
│   └── index.html        # Frontend del alta (estático, sin build)
└── supabase/
    └── functions/
        ├── wa-onboard/   # Alta por Embedded Signup (code → token → register → ruta)
        └── wa-router/    # Recibe webhooks de WA, valida firma y rutea por phone_number_id
```

## Frontend (`web/index.html`)

Página estática única. Captura *nombre del cliente* + *URL del agente*, lanza el popup
de Meta (Facebook JS SDK) y manda `code` + datos del WABA a la Edge Function `wa-onboard`.

**Antes de desplegar:** en `web/index.html`, dentro de `CONFIG`, reemplazar
`PON_AQUI_EL_MISMO_ONBOARD_SECRET` por el mismo valor del secreto `ONBOARD_SECRET`
configurado en Supabase.

### Deploy (Vercel)
- Root del proyecto: `web/`
- Dominio: `metawhatsapp.vortacompany.com` (CNAME → `cname.vercel-dns.com`, proxy OFF en Cloudflare)
- Autorizar el dominio en Meta → App → Facebook Login → *Allowed Domains for the JavaScript SDK*.

## Backend (Supabase · ref `iupcodfmtspifmczppje`)

```bash
supabase login
supabase link --project-ref iupcodfmtspifmczppje
supabase functions deploy wa-onboard --no-verify-jwt
supabase functions deploy wa-router  --no-verify-jwt
```

## Datos de referencia

| Dato            | Valor |
|-----------------|-------|
| Meta App ID     | `1391319849718291` |
| Config ID       | `1719626502389702` |
| Graph API       | `v21.0` |
| wa-onboard URL  | `https://iupcodfmtspifmczppje.supabase.co/functions/v1/wa-onboard` |
| wa-router URL   | `https://iupcodfmtspifmczppje.supabase.co/functions/v1/wa-router` |

## Seguridad
- **No** regenerar el App Secret de Meta (rompe el ruteo de clientes vivos).
- Nunca commitear secretos. Los valores viven en Supabase Secrets y Vercel env.
- `wa_clientes` guarda tokens de clientes: mantener RLS cerrada (sin políticas públicas).
