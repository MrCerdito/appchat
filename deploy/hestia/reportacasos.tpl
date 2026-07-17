#=========================================================================#
# Proxy Template propia - ReportaCasos (innoovacloud.com)                 #
# Basada en default.tpl, pero reenvia directo a los contenedores Docker   #
# (frontend 127.0.0.1:8095 / backend 127.0.0.1:3001) en vez de a Apache.  #
# Instalar en: /usr/local/hestia/data/templates/web/nginx/                #
#=========================================================================#

server {
	listen      %ip%:%proxy_port%;
	server_name %domain_idn% %alias_idn%;
	error_log   /var/log/%web_system%/domains/%domain%.error.log error;

	include %home%/%user%/conf/web/%domain%/nginx.forcessl.conf*;

	# Necesario para que Certbot/Hestia puedan renovar el certificado
	location ^~ /.well-known/acme-challenge/ {
		root      %docroot%;
		try_files $uri =404;
	}

	location ~ /\.(?!well-known\/|file) {
		deny all;
		return 404;
	}

	location / {
		proxy_pass http://127.0.0.1:8095;
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
	}

	location /error/ {
		alias %home%/%user%/web/%domain%/document_errors/;
	}

	include %home%/%user%/conf/web/%domain%/nginx.conf_*;
}
