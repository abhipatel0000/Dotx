FROM php:8.2-cli

# Install PDO MySQL extension
RUN docker-php-ext-install pdo pdo_mysql

# Copy project files
WORKDIR /app
COPY . /app/

# Railway provides $PORT — PHP built-in server binds to it directly
CMD php -S 0.0.0.0:${PORT:-8080} -t /app