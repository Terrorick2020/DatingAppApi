export interface VideoResponse {
	id: number
	createdAt: Date
	updatedAt: Date
	key: string
	previewKey?: string | null
	telegramId: string
	title?: string | null
	description?: string | null
	isPublished: boolean
	likesCount: number
	viewsCount: number
	url?: string
	previewUrl?: string | null
	psychologist?: {
		id: string
		name: string
		about: string
		photoUrl?: string | null
	}
}

export interface VideoWithUrl extends VideoResponse {
	url: string
	previewUrl?: string | null
	isLiked?: boolean
	isView?: boolean
}

export interface VideoListResponse {
	videos: VideoWithUrl[]
	total: number
	isChecked?: boolean
}

export interface UploadVideoResponse {
	videoId: number
	key: string
	previewKey?: string | null
	url?: string
	previewUrl?: string | null
	// Поля для процесса конвертации
	status?: string
	message?: string
	originalFormat?: string
	estimatedTime?: string
	format?: string
	ready?: boolean
}

export interface LikeVideoResponse {
	isLiked: boolean
	likesCount: number
}
