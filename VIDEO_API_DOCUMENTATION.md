## Аутентификация

Все эндпоинты защищены `UserStatusGuard` и требуют валидной авторизации.

---

## 📹 Короткие видео (для пользователей)

### 1. GET /video/short-videos/feed - Получение ленты коротких видео

**Описание:** Получает ленту коротких видео с пагинацией для пользователей.

**Параметры запроса:**

- `telegramId` (string, обязательный) - ID пользователя
- `limit` (number, опциональный, 1-50, по умолчанию 10) - Количество видео
- `offset` (number, опциональный, ≥0, по умолчанию 0) - Смещение для пагинации

**Запрос:**

```http
GET /video/short-videos/feed?telegramId=123456789&limit=10&offset=0

```

**Ответ:**

```json
{
	"success": true,
	"data": {
		"videos": [
			{
				"id": 1,
				"createdAt": "2024-01-15T10:30:00.000Z",
				"updatedAt": "2024-01-15T10:30:00.000Z",
				"key": "psychologist_videos/uuid-video.mp4",
				"telegramId": "psychologist_123",
				"title": "Советы по отношениям",
				"description": "Как правильно общаться с партнером",
				"isPublished": true,
				"likesCount": 42,
				"viewsCount": 156,
				"url": "https://s3.amazonaws.com/bucket/psychologist_videos/uuid-video.mp4?signature=...",
				"psychologist": {
					"id": 1,
					"name": "Анна Психолог",
					"about": "Сертифицированный психолог с 10-летним опытом"
				}
			}
		],
		"total": 25
	},
	"message": "Лента коротких видео получена"
}
```

### 2. POST /video/short-videos/:videoId/like - Лайк/дизлайк короткого видео

**Описание:** Переключает лайк для короткого видео (toggle-система).

**Параметры пути:**

- `videoId` (number) - ID видео

**Тело запроса:**

```json
{
	"telegramId": "123456789",
	"videoId": 1
}
```

**Запрос:**

```http
POST /video/short-videos/1/like
Content-Type: application/json
Authorization: Bearer <token>

{
  "telegramId": "123456789",
  "videoId": 1
}
```

**Ответ (лайк добавлен):**

```json
{
	"success": true,
	"data": {
		"isLiked": true,
		"likesCount": 43
	},
	"message": "Видео лайкнуто"
}
```

**Ответ (лайк убран):**

```json
{
	"success": true,
	"data": {
		"isLiked": false,
		"likesCount": 42
	},
	"message": "Лайк убран"
}
```

### 3. POST /video/short-videos/:videoId/view - Учет просмотра короткого видео

**Описание:** Увеличивает счетчик просмотров видео (только один раз на пользователя).

**Параметры пути:**

- `videoId` (number) - ID видео

**Тело запроса:**

```json
{
	"telegramId": "123456789",
	"videoId": 1
}
```

**Запрос:**

```http
POST /video/short-videos/1/view
Content-Type: application/json
Authorization: Bearer <token>

{
  "telegramId": "123456789",
  "videoId": 1
}
```

**Ответ (первый просмотр):**

```json
{
	"success": true,
	"data": {
		"viewsCount": 157
	},
	"message": "Просмотр засчитан"
}
```

**Ответ (повторный просмотр):**

```json
{
	"success": true,
	"data": {
		"viewsCount": 156
	},
	"message": "Просмотр уже засчитан"
}
```

---

## 🎥 Обычные видео (для психологов)

### 4. POST /video/upload - Загрузка видео в облако

**Описание:** Загружает видеофайл в облачное хранилище (первый этап загрузки).

**Тело запроса (multipart/form-data):**

- `video` (file, обязательный) - Видеофайл
- `telegramId` (string, обязательный) - ID психолога

**Ограничения:**

- Максимальный размер: 100MB
- Поддерживаемые форматы: MP4, AVI, MOV, WMV, WebM

**Запрос:**

```http
POST /video/upload
Content-Type: multipart/form-data
Authorization: Bearer <psychologist_token>

FormData:
- video: <file>
- telegramId: "psychologist_123"
```

**Ответ:**

```json
{
	"success": true,
	"data": {
		"videoId": 0,
		"key": "psychologist_videos/uuid-video.mp4"
	},
	"message": "Видео загружено в облако"
}
```

### 5. POST /video/save - Сохранение метаданных видео

**Описание:** Сохраняет метаданные видео в базе данных (второй этап загрузки).

**Тело запроса:**

```json
{
	"key": "psychologist_videos/uuid-video.mp4",
	"telegramId": "psychologist_123",
	"title": "Советы по отношениям",
	"description": "Как правильно общаться с партнером"
}
```

**Запрос:**

```http
POST /video/save
Content-Type: application/json
Authorization: Bearer <psychologist_token>

{
  "key": "psychologist_videos/uuid-video.mp4",
  "telegramId": "psychologist_123",
  "title": "Советы по отношениям",
  "description": "Как правильно общаться с партнером"
}
```

**Ответ:**

```json
{
	"success": true,
	"data": {
		"videoId": 1,
		"key": "psychologist_videos/uuid-video.mp4"
	},
	"message": "Видео сохранено"
}
```

### 6. PATCH /video/:id - Обновление видео

**Описание:** Обновляет метаданные существующего видео.

**Параметры пути:**

- `id` (number) - ID видео

**Параметры запроса:**

- `telegramId` (string) - ID психолога

**Тело запроса:**

```json
{
	"title": "Новое название",
	"description": "Новое описание",
	"isPublished": true
}
```

**Запрос:**

```http
PATCH /video/1?telegramId=psychologist_123
Content-Type: application/json
Authorization: Bearer <psychologist_token>

{
  "title": "Новое название",
  "description": "Новое описание",
  "isPublished": true
}
```

**Ответ:**

```json
{
	"success": true,
	"data": {
		"id": 1,
		"createdAt": "2024-01-15T10:30:00.000Z",
		"updatedAt": "2024-01-15T11:00:00.000Z",
		"key": "psychologist_videos/uuid-video.mp4",
		"telegramId": "psychologist_123",
		"title": "Новое название",
		"description": "Новое описание",
		"isPublished": true,
		"likesCount": 42,
		"viewsCount": 156,
		"url": "https://s3.amazonaws.com/bucket/psychologist_videos/uuid-video.mp4?signature=...",
		"psychologist": {
			"id": 1,
			"name": "Анна Психолог",
			"about": "Сертифицированный психолог с 10-летним опытом"
		}
	},
	"message": "Видео обновлено"
}
```

### 7. DELETE /video/:id - Удаление видео

**Описание:** Удаляет видео из облака и базы данных.

**Параметры пути:**

- `id` (number) - ID видео

**Параметры запроса:**

- `telegramId` (string) - ID психолога

**Запрос:**

```http
DELETE /video/1?telegramId=psychologist_123
Authorization: Bearer <psychologist_token>
```

**Ответ:**

```json
{
	"success": true,
	"data": null,
	"message": "Видео удалено"
}
```

### 8. GET /video/my - Получение видео психолога

**Описание:** Получает список всех видео конкретного психолога.

**Параметры запроса:**

- `telegramId` (string, обязательный) - ID психолога
- `limit` (number, опциональный, 1-50, по умолчанию 10) - Количество видео
- `offset` (number, опциональный, ≥0, по умолчанию 0) - Смещение для пагинации

**Запрос:**

```http
GET /video/my?telegramId=psychologist_123&limit=10&offset=0
Authorization: Bearer <psychologist_token>
```

**Ответ:**

```json
{
	"success": true,
	"data": {
		"videos": [
			{
				"id": 1,
				"createdAt": "2024-01-15T10:30:00.000Z",
				"updatedAt": "2024-01-15T10:30:00.000Z",
				"key": "psychologist_videos/uuid-video.mp4",
				"telegramId": "psychologist_123",
				"title": "Советы по отношениям",
				"description": "Как правильно общаться с партнером",
				"isPublished": true,
				"likesCount": 42,
				"viewsCount": 156,
				"url": "https://s3.amazonaws.com/bucket/psychologist_videos/uuid-video.mp4?signature=..."
			}
		],
		"total": 5
	},
	"message": "Видео психолога получены"
}
```

### 9. GET /video/public - Получение публичной ленты видео

**Описание:** Получает публичную ленту всех опубликованных видео с возможностью поиска.

**Параметры запроса:**

- `limit` (number, опциональный, 1-50, по умолчанию 10) - Количество видео
- `offset` (number, опциональный, ≥0, по умолчанию 0) - Смещение для пагинации
- `search` (string, опциональный) - Поисковый запрос

**Запрос:**

```http
GET /video/public?limit=10&offset=0&search=отношения
Authorization: Bearer <token>
```

**Ответ:**

```json
{
	"success": true,
	"data": {
		"videos": [
			{
				"id": 1,
				"createdAt": "2024-01-15T10:30:00.000Z",
				"updatedAt": "2024-01-15T10:30:00.000Z",
				"key": "psychologist_videos/uuid-video.mp4",
				"telegramId": "psychologist_123",
				"title": "Советы по отношениям",
				"description": "Как правильно общаться с партнером",
				"isPublished": true,
				"likesCount": 42,
				"viewsCount": 156,
				"url": "https://s3.amazonaws.com/bucket/psychologist_videos/uuid-video.mp4?signature=...",
				"psychologist": {
					"id": 1,
					"name": "Анна Психолог",
					"about": "Сертифицированный психолог с 10-летним опытом"
				}
			}
		],
		"total": 25
	},
	"message": "Публичная лента видео получена"
}
```

### 10. POST /video/:id/like - Лайк/дизлайк обычного видео

**Описание:** Переключает лайк для обычного видео (toggle-система).

**Параметры пути:**

- `id` (number) - ID видео

**Тело запроса:**

```json
{
	"userId": "123456789"
}
```

**Запрос:**

```http
POST /video/1/like
Content-Type: application/json
Authorization: Bearer <token>

{
  "userId": "123456789"
}
```

**Ответ (лайк добавлен):**

```json
{
	"success": true,
	"data": {
		"isLiked": true,
		"likesCount": 43
	},
	"message": "Лайк обновлен"
}
```

**Ответ (лайк убран):**

```json
{
	"success": true,
	"data": {
		"isLiked": false,
		"likesCount": 42
	},
	"message": "Лайк обновлен"
}
```

### 11. POST /video/:id/view - Учет просмотра обычного видео

**Описание:** Увеличивает счетчик просмотров обычного видео (только один раз на пользователя).

**Параметры пути:**

- `id` (number) - ID видео

**Тело запроса:**

```json
{
	"userId": "123456789"
}
```

**Запрос:**

```http
POST /video/1/view
Content-Type: application/json
Authorization: Bearer <token>

{
  "userId": "123456789"
}
```

**Ответ (первый просмотр):**

```json
{
	"success": true,
	"data": {
		"viewsCount": 157
	},
	"message": "Просмотр засчитан"
}
```

**Ответ (повторный просмотр):**

```json
{
	"success": true,
	"data": {
		"viewsCount": 156
	},
	"message": "Просмотр уже засчитан"
}
```

---

## 📋 DTO Схемы

### GetShortVideosDto

```typescript
{
  telegramId: string;    // ID пользователя
  limit?: number;        // Количество видео (1-50, по умолчанию 10)
  offset?: number;       // Смещение (≥0, по умолчанию 0)
}
```

### LikeShortVideoDto

```typescript
{
	telegramId: string // ID пользователя
	videoId: number // ID видео
}
```

### ViewShortVideoDto

```typescript
{
	telegramId: string // ID пользователя
	videoId: number // ID видео
}
```

### GetMyVideosDto

```typescript
{
  telegramId: string;    // ID психолога
  limit?: number;        // Количество видео (1-50, по умолчанию 10)
  offset?: number;       // Смещение (≥0, по умолчанию 0)
}
```

### GetPublicVideosDto

```typescript
{
  limit?: number;        // Количество видео (1-50, по умолчанию 10)
  offset?: number;       // Смещение (≥0, по умолчанию 0)
  search?: string;       // Поисковый запрос
}
```

### UploadVideoDto

```typescript
{
	telegramId: string // ID психолога
}
```

### SaveVideoDto

```typescript
{
  key: string;           // Ключ файла в облаке
  telegramId: string;    // ID психолога
  title?: string;        // Название видео
  description?: string;  // Описание видео
}
```

### UpdateVideoDto

```typescript
{
  title?: string;        // Название видео
  description?: string;  // Описание видео
  isPublished?: boolean; // Статус публикации
}
```

### LikeVideoDto

```typescript
{
	userId: string // ID пользователя
}
```

### ViewVideoDto

```typescript
{
	userId: string // ID пользователя
}
```

---

## 🚨 Коды ошибок

### 400 Bad Request

```json
{
	"success": false,
	"message": "Неподдерживаемый формат видео. Разрешены: MP4, AVI, MOV, WMV, WebM"
}
```

```json
{
	"success": false,
	"message": "Размер видеофайла не должен превышать 100MB"
}
```

### 403 Forbidden

```json
{
	"success": false,
	"message": "Пользователь не найден или заблокирован"
}
```

```json
{
	"success": false,
	"message": "Психолог не найден"
}
```

### 404 Not Found

```json
{
	"success": false,
	"message": "Видео не найдено"
}
```

### 500 Internal Server Error

```json
{
	"success": false,
	"message": "Ошибка при загрузке видео"
}
```

---

## 🔧 Технические детали

### Кеширование

- Presigned URL кешируются в Redis на 1 час 50 минут
- Ключ кеша: `video:${key}:url`

### Ограничения

- Максимальный размер видео: 100MB
- Поддерживаемые форматы: MP4, AVI, MOV, WMV, WebM
- Максимальное количество видео в запросе: 50

### Безопасность

- Все эндпоинты защищены `UserStatusGuard`
- Проверка существования пользователей и их статуса
- Валидация входных данных через DTO

### Производительность

- Пагинация для больших объемов данных
- Параллельная генерация URL через `Promise.all`
- Оптимизированные запросы к БД с `include` для связанных данных

---

## 📝 Примечания

1. **Двухэтапная загрузка:** Загрузка видео происходит в два этапа - сначала файл загружается в облако (`/upload`), затем сохраняются метаданные (`/save`).

2. **Toggle-система лайков:** Лайки работают по принципу переключения - если лайка нет, он добавляется; если есть - убирается.

3. **Уникальные просмотры:** Каждый пользователь может увеличить счетчик просмотров видео только один раз.

4. **Короткие видео:** Отдельные эндпоинты для коротких видео оптимизированы для TikTok-подобного интерфейса.

5. **Авторизация:** Все эндпоинты требуют валидной авторизации через `UserStatusGuard`.
