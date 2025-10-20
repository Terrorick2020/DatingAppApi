/**
 * Пример интеграции системы статуса пользователей в клиентском приложении
 */

// Типы для TypeScript
interface UserStatusResponse {
	success: boolean
	data?: { isOnline: boolean }
	message: string
}

interface OnlineUsersResponse {
	success: boolean
	data?: { onlineUsers: string[] }
	message: string
}

class UserStatusManager {
	private telegramId: string
	private activityInterval: NodeJS.Timeout | null = null
	private readonly API_BASE_URL =
		process.env.API_BASE_URL || 'http://localhost:3000'

	constructor(telegramId: string) {
		this.telegramId = telegramId
	}

	/**
	 * Установить пользователя как онлайн
	 */
	async setOnline(): Promise<void> {
		try {
			const response = await fetch(
				`${this.API_BASE_URL}/user-status/${this.telegramId}/online`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
				}
			)

			const result = await response.json()
			console.log('Пользователь установлен как онлайн:', result.message)
		} catch (error) {
			console.error('Ошибка при установке онлайн статуса:', error)
		}
	}

	/**
	 * Установить пользователя как оффлайн
	 */
	async setOffline(): Promise<void> {
		try {
			const response = await fetch(
				`${this.API_BASE_URL}/user-status/${this.telegramId}/offline`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
				}
			)

			const result = await response.json()
			console.log('Пользователь установлен как оффлайн:', result.message)
		} catch (error) {
			console.error('Ошибка при установке оффлайн статуса:', error)
		}
	}

	/**
	 * Обновить активность пользователя
	 */
	async updateActivity(): Promise<void> {
		try {
			const response = await fetch(
				`${this.API_BASE_URL}/user-status/${this.telegramId}/activity`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
				}
			)

			const result = await response.json()
			console.log('Активность обновлена:', result.message)
		} catch (error) {
			console.error('Ошибка при обновлении активности:', error)
		}
	}

	/**
	 * Проверить статус пользователя
	 */
	async getStatus(): Promise<boolean> {
		try {
			const response = await fetch(
				`${this.API_BASE_URL}/user-status/${this.telegramId}/status`
			)
			const result: UserStatusResponse = await response.json()
			return result.data?.isOnline || false
		} catch (error) {
			console.error('Ошибка при проверке статуса:', error)
			return false
		}
	}

	/**
	 * Получить список онлайн пользователей
	 */
	async getOnlineUsers(): Promise<string[]> {
		try {
			const response = await fetch(`${this.API_BASE_URL}/user-status/online`)
			const result: OnlineUsersResponse = await response.json()
			return result.data?.onlineUsers || []
		} catch (error) {
			console.error('Ошибка при получении онлайн пользователей:', error)
			return []
		}
	}

	/**
	 * Начать автоматическое обновление активности
	 */
	startActivityTracking(): void {
		// Обновляем активность каждые 2 минуты
		this.activityInterval = setInterval(() => {
			this.updateActivity()
		}, 120000) // 2 минуты
	}

	/**
	 * Остановить автоматическое обновление активности
	 */
	stopActivityTracking(): void {
		if (this.activityInterval) {
			clearInterval(this.activityInterval)
			this.activityInterval = null
		}
	}

	/**
	 * Инициализация для пользователя (вызывать при входе в приложение)
	 */
	async initialize(): Promise<void> {
		await this.setOnline()
		this.startActivityTracking()
	}

	/**
	 * Завершение работы (вызывать при выходе из приложения)
	 */
	async cleanup(): Promise<void> {
		this.stopActivityTracking()
		await this.setOffline()
	}
}

// Пример использования в React компоненте
export const useUserStatus = (telegramId: string) => {
	const [statusManager] = useState(() => new UserStatusManager(telegramId))
	const [isOnline, setIsOnline] = useState(false)

	useEffect(() => {
		// Инициализация при монтировании компонента
		statusManager.initialize()

		// Проверяем статус
		statusManager.getStatus().then(setIsOnline)

		// Очистка при размонтировании
		return () => {
			statusManager.cleanup()
		}
	}, [statusManager])

	return {
		isOnline,
		setOnline: () => statusManager.setOnline(),
		setOffline: () => statusManager.setOffline(),
		updateActivity: () => statusManager.updateActivity(),
		getStatus: () => statusManager.getStatus(),
		getOnlineUsers: () => statusManager.getOnlineUsers(),
	}
}

// Пример использования в Vue компоненте
export const useUserStatusVue = (telegramId: string) => {
	const statusManager = new UserStatusManager(telegramId)
	const isOnline = ref(false)

	onMounted(async () => {
		await statusManager.initialize()
		isOnline.value = await statusManager.getStatus()
	})

	onUnmounted(async () => {
		await statusManager.cleanup()
	})

	return {
		isOnline: readonly(isOnline),
		setOnline: () => statusManager.setOnline(),
		setOffline: () => statusManager.setOffline(),
		updateActivity: () => statusManager.updateActivity(),
		getStatus: () => statusManager.getStatus(),
		getOnlineUsers: () => statusManager.getOnlineUsers(),
	}
}

// Пример использования в обычном JavaScript
const userStatus = new UserStatusManager('123456789')

// При загрузке страницы
document.addEventListener('DOMContentLoaded', async () => {
	await userStatus.initialize()
	console.log('Пользователь онлайн')
})

// При закрытии страницы
window.addEventListener('beforeunload', async () => {
	await userStatus.cleanup()
	console.log('Пользователь оффлайн')
})

// При фокусе/разфокусе окна
document.addEventListener('visibilitychange', async () => {
	if (document.hidden) {
		await userStatus.setOffline()
	} else {
		await userStatus.setOnline()
	}
})
