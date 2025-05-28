export interface PhotoResponse {
    id: number
    url: string
}

export interface UserProfileResponse {
    telegramId: string
    name: string
    town: string
    sex: string
    selSex: string,
    age: number
    bio: string
    lang: string
    enableGeo: boolean
    isVerify: boolean
    latitude?: number
    longitude?: number
    role: string
    status: string
    referralCode?: string
    createdAt: string
    updatedAt: string
    photos: PhotoResponse[] // ⭐ Изменили тип
    interest: {
        id: number
        value: string
        label: string
        isOppos: boolean
    } | null
    invitedBy?: {
        telegramId: string
        name: string
    }
    invitedUsers: Array<{
        telegramId: string
        name: string
    }>
}