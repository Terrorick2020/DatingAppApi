import type { InterestsVarsItem, BaseVarsItem } from '@/seed/seed.type'

export interface InterestsVarsItemRes extends InterestsVarsItem {
    id: number
}

export interface PlansVarsItemRes extends BaseVarsItem {
    id: number
}

export interface CityesVarsItemRes extends BaseVarsItem {
    id: string
}

export interface RegionVarsItemRes extends PlansVarsItemRes {
    cityId: string
}
