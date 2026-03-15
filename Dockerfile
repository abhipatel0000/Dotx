FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install Apache + PHP
RUN apt-get update && apt-get install -y \
    apache2 \
    php8.1 \
    php8.1-mysql \
    libapache2-mod-php8.1 \
    && apt-get clean

# Enable mod_rewrite
RUN a2enmod rewrite

# Copy project files
COPY . /var/www/html/

# Remove default Apache index page
RUN rm -f /var/www/html/index.html

# Set permissions
RUN chown -R www-data:www-data /var/www/html && \
    chmod -R 755 /var/www/html

# Allow .htaccess overrides
RUN echo '<Directory /var/www/html>\n\
    Options Indexes FollowSymLinks\n\
    AllowOverride All\n\
    Require all granted\n\
    </Directory>' > /etc/apache2/conf-available/dotx.conf && \
    a2enconf dotx

# Set ServerName to suppress warning
RUN echo "ServerName localhost" >> /etc/apache2/apache2.conf

# Startup script: Railway sets $PORT dynamically, Apache must listen on it
RUN printf '#!/bin/bash\nsed -i "s/Listen 80/Listen ${PORT:-80}/" /etc/apache2/ports.conf\nsed -i "s/:80>/:${PORT:-80}>/" /etc/apache2/sites-enabled/000-default.conf\napache2ctl -D FOREGROUND\n' > /start.sh && chmod +x /start.sh

EXPOSE 80

CMD ["/bin/bash", "/start.sh"]