export interface BaseVarsItem {
    value: string
    label: string
}

export interface InterestsVarsItem extends BaseVarsItem {
    isOppos: boolean
}

export interface RegionsItem {
	[key: string]: BaseVarsItem[]
}

export interface CityNameCase {
	nominative: string
	genitive: string
	dative: string
	accusative: string
	ablative: string
	prepositional: string
	locative: string
}

export interface RegionCapital {
	name: string
	label: string
	id: string
	okato: string
	oktmo: string
	contentType: string
}

export interface RegionNameCase {
	nominative: string
	genitive: string
	dative: string
	accusative: string
	ablative: string
	prepositional: string
	locative: string
}

export interface Region {
	name: string
	label: string
	type: string
	typeShort: string
	contentType: string
	id: string
	okato: string
	oktmo: string
	guid: string
	code: number | string
	'iso_3166-2': string
	population: number
	yearFounded: number
	area: number
	fullname: string
	unofficialName?: string
	name_en: string
	district: string
	namecase: RegionNameCase
	capital?: RegionCapital
}

export interface CityTimezone {
	tzid: string
	abbreviation: string
	utcOffset: string
	mskOffset: string
}

export interface CityCoords {
	lat: number
	lon: number
}

export interface CityItem {
	name: string
	name_alt: string
	label: string
	type: string
	typeShort: string
	contentType: string
	id: string
	okato: string
	oktmo: string
	guid: string
	isDualName: boolean
	isCapital: boolean
	zip: number
	population: number
	yearFounded: number | string
	yearCityStatus: number | string
	name_en: string
	namecase: CityNameCase
	coords: CityCoords
	timezone: CityTimezone
	region: Region
}