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
		telegramId: string
		name: string
		about: string
		photoUrl?: string | null
	}
}

export interface VideoWithUrl extends VideoResponse {
	url: string
	previewUrl?: string | null
	isLiked?: boolean
}

export interface VideoListResponse {
	videos: VideoWithUrl[]
	total: number
	isChecked?: boolean
}

export interface UploadVideoResponse {
	videoId: number
	key: string
}

export interface LikeVideoResponse {
	isLiked: boolean
	likesCount: number
}
