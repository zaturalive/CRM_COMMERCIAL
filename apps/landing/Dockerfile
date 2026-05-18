# Landing page statique — servie par nginx:alpine
# Sert uniquement / (index.html) sur crm-chirurgie.a3n.fr (sans sous-domaine).
FROM nginx:1.27-alpine

COPY public/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# 127.0.0.1 force IPv4 — nginx alpine peut ecouter IPv6-only par defaut,
# auquel cas wget sur "localhost" echoue avec "Connection refused".
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O- http://127.0.0.1/ || exit 1
