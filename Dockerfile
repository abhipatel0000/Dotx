FROM php:8.2-apache

# Enable PDO MySQL extension
RUN docker-php-ext-install pdo pdo_mysql

# Copy all project files into Apache's web root
COPY . /var/www/html/

# Set correct permissions
RUN chown -R www-data:www-data /var/www/html

EXPOSE 80