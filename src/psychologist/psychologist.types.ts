export interface PsychologistPhoto {
	id: number
	key: string
	tempTgId: string | null
	telegramId: string | null
}

export interface PsychologistPhotoResponse {
	id: number
	url: string
}

export interface Psychologist {
	id: number
	telegramId: string
	name: string
	about: string
	status: 'Active' | 'Inactive' | 'Blocked'
	createdAt: Date
	updatedAt: Date
	photos: PsychologistPhotoResponse[]
}

export interface PsychologistPreview {
	id: number
	telegramId: string
	name: string
	about: string
	photos: PsychologistPhotoResponse[]
}

export interface PsychologistsListResponse {
	psychologists: PsychologistPreview[]
	total: number
}

export interface CreatePsychologistResponse {
	psychologist: Psychologist
	message: string
}

export interface UpdatePsychologistResponse {
	psychologist: Psychologist
}



 