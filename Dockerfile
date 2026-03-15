FROM php:8.2-apache

# Fix: disable conflicting MPM modules, enable only mpm_prefork
RUN a2dismod mpm_event mpm_worker 2>/dev/null || true && \
    a2enmod mpm_prefork

# Enable PDO MySQL extension
RUN docker-php-ext-install pdo pdo_mysql

# Copy all project files into Apache's web root
COPY . /var/www/html/

# Set correct permissions
RUN chown -R www-data:www-data /var/www/html

EXPOSE 80