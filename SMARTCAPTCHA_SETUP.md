# Настройка SmartCaptcha Yandex

## Переменные окружения

Добавьте в ваш `.env` файл:

```env
SMARTCAPTCHA_SERVER_KEY=your_smartcaptcha_server_key_here
```

## Как получить ключ

1. Зайдите в [Yandex Cloud Console](https://console.cloud.yandex.ru/)
2. Перейдите в раздел "SmartCaptcha"
3. Создайте новый ключ сервера
4. Скопируйте ключ и добавьте в переменные окружения

## Использование

Guard автоматически проверяет токен из заголовка `X-Captcha-Token` при регистрации пользователя.

### Пример запроса:

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -H "X-Captcha-Token: your_captcha_token_here" \
  -d '{
    "telegramId": "123456789",
    "name": "Иван",
    "age": 25,
    "sex": "Male",
    "selSex": "Female",
    "town": "Москва",
    "bio": "Привет!",
    "lang": "ru",
    "interestId": 1,
    "photoIds": [1, 2, 3],
    "enableGeo": true,
    "latitude": 55.7558,
    "longitude": 37.6176
  }'
```

## Ответы

### Успешная проверка (статус 201):

```json
{
	"success": true,
	"message": "Пользователь создан и фото привязаны",
	"data": {
		"user": {
			"telegramId": "123456789",
			"town": "Москва",
			"enableGeo": true,
			"coordinates": {
				"latitude": 55.7558,
				"longitude": 37.6176
			},
			"referralCode": "abc12345"
		}
	}
}
```

### Бот заблокирован (статус 403):

```json
{
	"success": false,
	"message": "Пользователь заблокирован",
	"error": "CAPTCHA_FAILED"
}
```

## Логирование

Guard логирует все попытки проверки:

- Успешные проверки (debug уровень)
- Заблокированные боты (warn уровень)
- Ошибки API (error уровень)

## Безопасность

- При отсутствии токена в заголовке guard разрешает доступ (для обратной совместимости)
- При отсутствии секретного ключа guard разрешает доступ
- При ошибках API guard разрешает доступ (fail-open стратегия)
- Таймаут запроса к API: 5 секунд
