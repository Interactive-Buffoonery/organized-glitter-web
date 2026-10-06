/**
* This file was @generated using pocketbase-typegen
*/

import type PocketBase from 'pocketbase'
import type { RecordService } from 'pocketbase'

export const Collections = {
	Authorigins: "_authOrigins",
	Externalauths: "_externalAuths",
	Mfas: "_mfas",
	Otps: "_otps",
	Superusers: "_superusers",
	AccountDeletions: "account_deletions",
	AppleOauthGrants: "apple_oauth_grants",
	ArchiveRestoreItems: "archive_restore_items",
	Artists: "artists",
	AuthStepUpAttempts: "auth_step_up_attempts",
	AuthStepUpProofs: "auth_step_up_proofs",
	BookIllustrators: "book_illustrators",
	BookPublishers: "book_publishers",
	ColoringBookTags: "coloring_book_tags",
	ColoringBooks: "coloring_books",
	ColoringMediums: "coloring_mediums",
	ColoringPageColorReferences: "coloring_page_color_references",
	ColoringPageProgressNotes: "coloring_page_progress_notes",
	ColoringPages: "coloring_pages",
	ColoringTags: "coloring_tags",
	Companies: "companies",
	MobileSyncReceipts: "mobile_sync_receipts",
	ProgressNotes: "progress_notes",
	ProjectTags: "project_tags",
	Projects: "projects",
	RandomizerSpins: "randomizer_spins",
	Tags: "tags",
	UserDashboardSettings: "user_dashboard_settings",
	UserDashboardStats: "user_dashboard_stats",
	UserYearlyStats: "user_yearly_stats",
	Users: "users",
} as const
export type Collections = typeof Collections[keyof typeof Collections]

// Alias types for improved usability
export type IsoDateString = string
export type IsoAutoDateString = string & { readonly autodate: unique symbol }
export type RecordIdString = string
export type FileNameString = string & { readonly filename: unique symbol }
export type HTMLString = string

type ExpandType<T> = unknown extends T
	? T extends unknown
		? { expand?: unknown }
		: { expand: T }
	: { expand: T }

// System fields
export type BaseSystemFields<T = unknown> = {
	id: RecordIdString
	collectionId: string
	collectionName: Collections
} & ExpandType<T>

export type AuthSystemFields<T = unknown> = {
	email: string
	emailVisibility: boolean
	username: string
	verified: boolean
} & BaseSystemFields<T>

// Record types for each collection

export type AuthoriginsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	fingerprint: string
	id: string
	recordRef: string
	updated: IsoAutoDateString
}

export type ExternalauthsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	provider: string
	providerId: string
	recordRef: string
	updated: IsoAutoDateString
}

export type MfasRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	method: string
	recordRef: string
	updated: IsoAutoDateString
}

export type OtpsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	password: string
	recordRef: string
	sentTo?: string
	updated: IsoAutoDateString
}

export type SuperusersRecord = {
	created: IsoAutoDateString
	email: string
	emailVisibility?: boolean
	id: string
	password: string
	tokenKey: string
	updated: IsoAutoDateString
	verified?: boolean
}

export type AccountDeletionsRecord<Tusage_snapshot = unknown> = {
	created: IsoAutoDateString
	id: string
	notes?: string
	signup_method: string
	updated: IsoAutoDateString
	usage_snapshot?: null | Tusage_snapshot
	user_email: string
	user_id: string
}

export const AppleOauthGrantsStateOptions = {
	"active": "active",
	"revocation_pending": "revocation_pending",
} as const
export type AppleOauthGrantsStateOptions = typeof AppleOauthGrantsStateOptions[keyof typeof AppleOauthGrantsStateOptions]
export type AppleOauthGrantsRecord = {
	ciphertext: string
	client_id: string
	created: IsoAutoDateString
	id: string
	key_version: string
	provider_id_hash: string
	state: AppleOauthGrantsStateOptions
	updated: IsoAutoDateString
	user_id: string
}

export const ArchiveRestoreItemsItemKindOptions = {
	"diamond-project": "diamond-project",
	"diamond-project-note": "diamond-project-note",
	"coloring-medium": "coloring-medium",
	"coloring-book": "coloring-book",
	"coloring-page": "coloring-page",
	"coloring-page-note": "coloring-page-note",
	"coloring-color-reference": "coloring-color-reference",
	"asset": "asset",
} as const
export type ArchiveRestoreItemsItemKindOptions = typeof ArchiveRestoreItemsItemKindOptions[keyof typeof ArchiveRestoreItemsItemKindOptions]

export const ArchiveRestoreItemsStateOptions = {
	"scaffold": "scaffold",
	"complete": "complete",
} as const
export type ArchiveRestoreItemsStateOptions = typeof ArchiveRestoreItemsStateOptions[keyof typeof ArchiveRestoreItemsStateOptions]
export type ArchiveRestoreItemsRecord = {
	asset_position?: number
	descriptor_digest?: string
	backup_id: string
	id: string
	item_digest: string
	item_id: string
	item_kind: ArchiveRestoreItemsItemKindOptions
	state: ArchiveRestoreItemsStateOptions
	stored_filename?: string
	target_collection: string
	target_field?: string
	target_record_id: string
	user: RecordIdString
}

export type ArtistsRecord = {
	created: IsoAutoDateString
	id: string
	name: string
	updated: IsoAutoDateString
	user: RecordIdString
}

export type AuthStepUpAttemptsRecord = {
	failure_count: number
	id: string
	user: RecordIdString
	window_started: IsoDateString
}

export const AuthStepUpProofsActionOptions = {
	"link": "link",
	"unlink": "unlink",
} as const
export type AuthStepUpProofsActionOptions = typeof AuthStepUpProofsActionOptions[keyof typeof AuthStepUpProofsActionOptions]

export const AuthStepUpProofsTargetProviderOptions = {
	"apple": "apple",
	"google": "google",
	"discord": "discord",
} as const
export type AuthStepUpProofsTargetProviderOptions = typeof AuthStepUpProofsTargetProviderOptions[keyof typeof AuthStepUpProofsTargetProviderOptions]

export const AuthStepUpProofsVerificationMethodOptions = {
	"password": "password",
	"oauth": "oauth",
} as const
export type AuthStepUpProofsVerificationMethodOptions = typeof AuthStepUpProofsVerificationMethodOptions[keyof typeof AuthStepUpProofsVerificationMethodOptions]

export const AuthStepUpProofsVerificationProviderOptions = {
	"apple": "apple",
	"google": "google",
	"discord": "discord",
} as const
export type AuthStepUpProofsVerificationProviderOptions = typeof AuthStepUpProofsVerificationProviderOptions[keyof typeof AuthStepUpProofsVerificationProviderOptions]
export type AuthStepUpProofsRecord = {
	action: AuthStepUpProofsActionOptions
	expires: IsoDateString
	id: string
	proof_hash: string
	target_provider: AuthStepUpProofsTargetProviderOptions
	user: RecordIdString
	verification_identity_hash?: string
	verification_method: AuthStepUpProofsVerificationMethodOptions
	verification_provider?: AuthStepUpProofsVerificationProviderOptions
}

export type BookIllustratorsRecord = {
	created: IsoAutoDateString
	id: string
	name: string
	updated: IsoAutoDateString
	user: RecordIdString
}

export type BookPublishersRecord = {
	created: IsoAutoDateString
	id: string
	name: string
	updated: IsoAutoDateString
	user: RecordIdString
	website_url?: string
}

export type ColoringBookTagsRecord = {
	book: RecordIdString
	id: string
	tag: RecordIdString
}

export const ColoringBooksStatusOptions = {
	"wishlist": "wishlist",
	"purchased": "purchased",
	"in_stash": "in_stash",
	"in_progress": "in_progress",
	"completed": "completed",
	"archived": "archived",
	"destashed": "destashed",
} as const
export type ColoringBooksStatusOptions = typeof ColoringBooksStatusOptions[keyof typeof ColoringBooksStatusOptions]

export const ColoringBooksBookFormatOptions = {
	"paperback": "paperback",
	"hardcover": "hardcover",
	"pdf": "pdf",
	"printable_pages": "printable_pages",
	"magazine": "magazine",
	"other": "other",
} as const
export type ColoringBooksBookFormatOptions = typeof ColoringBooksBookFormatOptions[keyof typeof ColoringBooksBookFormatOptions]

export const ColoringBooksLanguageOptions = {
	"english": "english",
	"spanish": "spanish",
	"french": "french",
	"german": "german",
	"japanese": "japanese",
	"other": "other",
	"unknown": "unknown",
} as const
export type ColoringBooksLanguageOptions = typeof ColoringBooksLanguageOptions[keyof typeof ColoringBooksLanguageOptions]
export type ColoringBooksRecord = {
	book_format?: ColoringBooksBookFormatOptions
	completed_pages?: number
	completion_percentage?: number
	cover_image?: FileNameString
	created: IsoAutoDateString
	date_completed?: IsoDateString
	date_purchased?: IsoDateString
	date_received?: IsoDateString
	date_started?: IsoDateString
	edition?: string
	id: string
	illustrator?: RecordIdString
	is_mystery?: boolean
	isbn?: string
	language?: ColoringBooksLanguageOptions
	last_activity_at?: IsoDateString
	notes?: string
	publication_year?: number
	publisher?: RecordIdString
	revision?: number
	series?: string
	source_url?: string
	status: ColoringBooksStatusOptions
	theme?: string
	title: string
	total_pages: number
	updated: IsoAutoDateString
	user: RecordIdString
}

export const ColoringMediumsTypeOptions = {
	"colored_pencil": "colored_pencil",
	"alcohol_marker": "alcohol_marker",
	"water_based_marker": "water_based_marker",
	"gel_pen": "gel_pen",
	"watercolor": "watercolor",
	"pastel": "pastel",
	"other": "other",
	"acrylic_paint_pen": "acrylic_paint_pen",
} as const
export type ColoringMediumsTypeOptions = typeof ColoringMediumsTypeOptions[keyof typeof ColoringMediumsTypeOptions]
export type ColoringMediumsRecord = {
	brand?: string
	color_count?: number
	created: IsoAutoDateString
	id: string
	name: string
	notes?: string
	type: ColoringMediumsTypeOptions
	updated: IsoAutoDateString
	user: RecordIdString
}

export type ColoringPageColorReferencesRecord<Tupload_receipts = unknown> = {
	created: IsoAutoDateString
	id: string
	notes?: string
	page: RecordIdString
	photos?: FileNameString[]
	restore_key?: string
	updated: IsoAutoDateString
	upload_receipts?: null | Tupload_receipts
	user: RecordIdString
}

export type ColoringPageProgressNotesRecord = {
	content?: string
	created: IsoAutoDateString
	date: IsoDateString
	id: string
	image?: FileNameString
	page: RecordIdString
	updated: IsoAutoDateString
	user: RecordIdString
}

export const ColoringPagesStatusOptions = {
	"not_started": "not_started",
	"palette_chosen": "palette_chosen",
	"in_progress": "in_progress",
	"on_hold": "on_hold",
	"completed": "completed",
} as const
export type ColoringPagesStatusOptions = typeof ColoringPagesStatusOptions[keyof typeof ColoringPagesStatusOptions]
export type ColoringPagesRecord = {
	book: RecordIdString
	completed_at?: IsoDateString
	created: IsoAutoDateString
	id: string
	mediums?: RecordIdString[]
	page_number: number
	photos?: FileNameString[]
	revealed_at?: IsoDateString
	revealed_subject?: string
	started_at?: IsoDateString
	status: ColoringPagesStatusOptions
	updated: IsoAutoDateString
}

export type ColoringTagsRecord = {
	color: string
	created: IsoAutoDateString
	id: string
	name: string
	slug: string
	updated: IsoAutoDateString
	user: RecordIdString
}

export type CompaniesRecord = {
	created: IsoAutoDateString
	id: string
	name: string
	updated: IsoAutoDateString
	user: RecordIdString
	website_url?: string
}

export type MobileSyncReceiptsRecord = {
	id: string
	operation_id: string
	request_hash: string
	user: RecordIdString
}

export type ProgressNotesRecord = {
	content?: HTMLString
	created: IsoAutoDateString
	date: IsoDateString
	id: string
	image?: FileNameString
	project: RecordIdString
	updated: IsoAutoDateString
}

export type ProjectTagsRecord = {
	created: IsoAutoDateString
	id: string
	project: RecordIdString
	tag: RecordIdString
	updated: IsoAutoDateString
}

export const ProjectsStatusOptions = {
	"wishlist": "wishlist",
	"purchased": "purchased",
	"stash": "stash",
	"progress": "progress",
	"completed": "completed",
	"archived": "archived",
	"destashed": "destashed",
	"onhold": "onhold",
	"kitted": "kitted",
} as const
export type ProjectsStatusOptions = typeof ProjectsStatusOptions[keyof typeof ProjectsStatusOptions]

export const ProjectsKitCategoryOptions = {
	"full": "full",
	"mini": "mini",
} as const
export type ProjectsKitCategoryOptions = typeof ProjectsKitCategoryOptions[keyof typeof ProjectsKitCategoryOptions]

export const ProjectsDrillShapeOptions = {
	"round": "round",
	"square": "square",
} as const
export type ProjectsDrillShapeOptions = typeof ProjectsDrillShapeOptions[keyof typeof ProjectsDrillShapeOptions]
export type ProjectsRecord = {
	artist?: RecordIdString
	artist_name_sort?: string
	artist_sort_order?: number
	color_count?: number
	company?: RecordIdString
	company_name_sort?: string
	company_sort_order?: number
	created: IsoAutoDateString
	date_completed?: IsoDateString
	date_completed_has_value?: number
	date_purchased?: IsoDateString
	date_purchased_has_value?: number
	date_received?: IsoDateString
	date_received_has_value?: number
	date_started?: IsoDateString
	date_started_has_value?: number
	drill_shape?: ProjectsDrillShapeOptions
	general_notes?: HTMLString
	height?: number
	id: string
	image?: FileNameString
	kit_category: ProjectsKitCategoryOptions
	revision?: number
	source_url?: string
	status: ProjectsStatusOptions
	status_order?: number
	title: string
	title_sort?: string
	total_diamonds?: number
	updated: IsoAutoDateString
	user: RecordIdString
	width?: number
	width_has_value?: number
}

export type RandomizerSpinsRecord<Tmetadata = unknown, Tselected_projects = unknown> = {
	created: IsoAutoDateString
	id: string
	metadata?: null | Tmetadata
	project?: RecordIdString
	project_artist?: string
	project_company?: string
	project_title: string
	selected_count?: number
	selected_projects: null | Tselected_projects
	spun_at: IsoDateString
	updated: IsoAutoDateString
	user: RecordIdString
}

export type TagsRecord = {
	color: string
	created: IsoAutoDateString
	id: string
	name: string
	slug: string
	updated: IsoAutoDateString
	user: RecordIdString
}

export type UserDashboardSettingsRecord<Tcoloring_navigation_context = unknown, Tnavigation_context = unknown, Trandomizer_next_up = unknown, Tvertical_enabled = unknown> = {
	coloring_navigation_context?: null | Tcoloring_navigation_context
	created: IsoAutoDateString
	id: string
	navigation_context?: null | Tnavigation_context
	randomizer_next_up?: null | Trandomizer_next_up
	updated: IsoAutoDateString
	user: RecordIdString
	vertical_enabled?: null | Tvertical_enabled
}

export type UserDashboardStatsRecord = {
	all?: number
	archived?: number
	completed?: number
	created: IsoAutoDateString
	destashed?: number
	id: string
	kitted?: number
	last_updated?: IsoDateString
	onhold?: number
	progress?: number
	purchased?: number
	stash?: number
	total_projects?: number
	updated: IsoAutoDateString
	user: RecordIdString
	wishlist?: number
}

export const UserYearlyStatsStatsTypeOptions = {
	"yearly": "yearly",
} as const
export type UserYearlyStatsStatsTypeOptions = typeof UserYearlyStatsStatsTypeOptions[keyof typeof UserYearlyStatsStatsTypeOptions]
export type UserYearlyStatsRecord<Tstatus_breakdown = unknown> = {
	cache_version?: string
	calculation_duration_ms?: number
	completed_count?: number
	created: IsoAutoDateString
	estimated_drills?: number
	id: string
	in_progress_count?: number
	last_calculated: IsoDateString
	projects_included?: number
	started_count?: number
	stats_type: UserYearlyStatsStatsTypeOptions
	status_breakdown?: null | Tstatus_breakdown
	total_diamonds?: number
	updated: IsoAutoDateString
	user: RecordIdString
	year: number
}

export const UsersThemePreferenceOptions = {
	"system": "system",
	"light": "light",
	"dark": "dark",
	"catppuccin-latte": "catppuccin-latte",
	"catppuccin-frappe": "catppuccin-frappe",
	"catppuccin-macchiato": "catppuccin-macchiato",
	"catppuccin-mocha": "catppuccin-mocha",
} as const
export const UsersThemePaletteOptions = {
	"lilac-dusk": "lilac-dusk",
	"raspberry-sunrise": "raspberry-sunrise",
} as const
export type UsersThemePaletteOptions = typeof UsersThemePaletteOptions[keyof typeof UsersThemePaletteOptions]
export type UsersThemePreferenceOptions = typeof UsersThemePreferenceOptions[keyof typeof UsersThemePreferenceOptions]
export type UsersRecord = {
	analytics_opt_out?: boolean
	avatar?: FileNameString
	beta_tester?: boolean
	coloring_walkthrough_seen?: boolean
	created: IsoAutoDateString
	email: string
	emailVisibility?: boolean
	id: string
	password: string
	theme_palette?: UsersThemePaletteOptions
	theme_preference?: UsersThemePreferenceOptions
	timezone?: string
	tokenKey: string
	updated: IsoAutoDateString
	username: string
	verified?: boolean
}

// Response types include system fields and match responses from the PocketBase API
export type AuthoriginsResponse<Texpand = unknown> = Required<AuthoriginsRecord> & BaseSystemFields<Texpand>
export type ExternalauthsResponse<Texpand = unknown> = Required<ExternalauthsRecord> & BaseSystemFields<Texpand>
export type MfasResponse<Texpand = unknown> = Required<MfasRecord> & BaseSystemFields<Texpand>
export type OtpsResponse<Texpand = unknown> = Required<OtpsRecord> & BaseSystemFields<Texpand>
export type SuperusersResponse<Texpand = unknown> = Required<SuperusersRecord> & AuthSystemFields<Texpand>
export type AccountDeletionsResponse<Tusage_snapshot = unknown, Texpand = unknown> = Required<AccountDeletionsRecord<Tusage_snapshot>> & BaseSystemFields<Texpand>
export type AppleOauthGrantsResponse<Texpand = unknown> = Required<AppleOauthGrantsRecord> & BaseSystemFields<Texpand>
export type ArchiveRestoreItemsResponse<Texpand = unknown> = Required<ArchiveRestoreItemsRecord> & BaseSystemFields<Texpand>
export type ArtistsResponse<Texpand = unknown> = Required<ArtistsRecord> & BaseSystemFields<Texpand>
export type AuthStepUpAttemptsResponse<Texpand = unknown> = Required<AuthStepUpAttemptsRecord> & BaseSystemFields<Texpand>
export type AuthStepUpProofsResponse<Texpand = unknown> = Required<AuthStepUpProofsRecord> & BaseSystemFields<Texpand>
export type BookIllustratorsResponse<Texpand = unknown> = Required<BookIllustratorsRecord> & BaseSystemFields<Texpand>
export type BookPublishersResponse<Texpand = unknown> = Required<BookPublishersRecord> & BaseSystemFields<Texpand>
export type ColoringBookTagsResponse<Texpand = unknown> = Required<ColoringBookTagsRecord> & BaseSystemFields<Texpand>
export type ColoringBooksResponse<Texpand = unknown> = Required<ColoringBooksRecord> & BaseSystemFields<Texpand>
export type ColoringMediumsResponse<Texpand = unknown> = Required<ColoringMediumsRecord> & BaseSystemFields<Texpand>
export type ColoringPageColorReferencesResponse<Tupload_receipts = unknown, Texpand = unknown> = Required<ColoringPageColorReferencesRecord<Tupload_receipts>> & BaseSystemFields<Texpand>
export type ColoringPageProgressNotesResponse<Texpand = unknown> = Required<ColoringPageProgressNotesRecord> & BaseSystemFields<Texpand>
export type ColoringPagesResponse<Texpand = unknown> = Required<ColoringPagesRecord> & BaseSystemFields<Texpand>
export type ColoringTagsResponse<Texpand = unknown> = Required<ColoringTagsRecord> & BaseSystemFields<Texpand>
export type CompaniesResponse<Texpand = unknown> = Required<CompaniesRecord> & BaseSystemFields<Texpand>
export type MobileSyncReceiptsResponse<Texpand = unknown> = Required<MobileSyncReceiptsRecord> & BaseSystemFields<Texpand>
export type ProgressNotesResponse<Texpand = unknown> = Required<ProgressNotesRecord> & BaseSystemFields<Texpand>
export type ProjectTagsResponse<Texpand = unknown> = Required<ProjectTagsRecord> & BaseSystemFields<Texpand>
export type ProjectsResponse<Texpand = unknown> = Required<ProjectsRecord> & BaseSystemFields<Texpand>
export type RandomizerSpinsResponse<Tmetadata = unknown, Tselected_projects = unknown, Texpand = unknown> = Required<RandomizerSpinsRecord<Tmetadata, Tselected_projects>> & BaseSystemFields<Texpand>
export type TagsResponse<Texpand = unknown> = Required<TagsRecord> & BaseSystemFields<Texpand>
export type UserDashboardSettingsResponse<Tcoloring_navigation_context = unknown, Tnavigation_context = unknown, Trandomizer_next_up = unknown, Tvertical_enabled = unknown, Texpand = unknown> = Required<UserDashboardSettingsRecord<Tcoloring_navigation_context, Tnavigation_context, Trandomizer_next_up, Tvertical_enabled>> & BaseSystemFields<Texpand>
export type UserDashboardStatsResponse<Texpand = unknown> = Required<UserDashboardStatsRecord> & BaseSystemFields<Texpand>
export type UserYearlyStatsResponse<Tstatus_breakdown = unknown, Texpand = unknown> = Required<UserYearlyStatsRecord<Tstatus_breakdown>> & BaseSystemFields<Texpand>
export type UsersResponse<Texpand = unknown> = Required<UsersRecord> & AuthSystemFields<Texpand>

// Types containing all Records and Responses, useful for creating typing helper functions

export type CollectionRecords = {
	_authOrigins: AuthoriginsRecord
	_externalAuths: ExternalauthsRecord
	_mfas: MfasRecord
	_otps: OtpsRecord
	_superusers: SuperusersRecord
	account_deletions: AccountDeletionsRecord
	apple_oauth_grants: AppleOauthGrantsRecord
	archive_restore_items: ArchiveRestoreItemsRecord
	artists: ArtistsRecord
	auth_step_up_attempts: AuthStepUpAttemptsRecord
	auth_step_up_proofs: AuthStepUpProofsRecord
	book_illustrators: BookIllustratorsRecord
	book_publishers: BookPublishersRecord
	coloring_book_tags: ColoringBookTagsRecord
	coloring_books: ColoringBooksRecord
	coloring_mediums: ColoringMediumsRecord
	coloring_page_color_references: ColoringPageColorReferencesRecord
	coloring_page_progress_notes: ColoringPageProgressNotesRecord
	coloring_pages: ColoringPagesRecord
	coloring_tags: ColoringTagsRecord
	companies: CompaniesRecord
	mobile_sync_receipts: MobileSyncReceiptsRecord
	progress_notes: ProgressNotesRecord
	project_tags: ProjectTagsRecord
	projects: ProjectsRecord
	randomizer_spins: RandomizerSpinsRecord
	tags: TagsRecord
	user_dashboard_settings: UserDashboardSettingsRecord
	user_dashboard_stats: UserDashboardStatsRecord
	user_yearly_stats: UserYearlyStatsRecord
	users: UsersRecord
}

export type CollectionResponses = {
	_authOrigins: AuthoriginsResponse
	_externalAuths: ExternalauthsResponse
	_mfas: MfasResponse
	_otps: OtpsResponse
	_superusers: SuperusersResponse
	account_deletions: AccountDeletionsResponse
	apple_oauth_grants: AppleOauthGrantsResponse
	archive_restore_items: ArchiveRestoreItemsResponse
	artists: ArtistsResponse
	auth_step_up_attempts: AuthStepUpAttemptsResponse
	auth_step_up_proofs: AuthStepUpProofsResponse
	book_illustrators: BookIllustratorsResponse
	book_publishers: BookPublishersResponse
	coloring_book_tags: ColoringBookTagsResponse
	coloring_books: ColoringBooksResponse
	coloring_mediums: ColoringMediumsResponse
	coloring_page_color_references: ColoringPageColorReferencesResponse
	coloring_page_progress_notes: ColoringPageProgressNotesResponse
	coloring_pages: ColoringPagesResponse
	coloring_tags: ColoringTagsResponse
	companies: CompaniesResponse
	mobile_sync_receipts: MobileSyncReceiptsResponse
	progress_notes: ProgressNotesResponse
	project_tags: ProjectTagsResponse
	projects: ProjectsResponse
	randomizer_spins: RandomizerSpinsResponse
	tags: TagsResponse
	user_dashboard_settings: UserDashboardSettingsResponse
	user_dashboard_stats: UserDashboardStatsResponse
	user_yearly_stats: UserYearlyStatsResponse
	users: UsersResponse
}

// Utility types for create/update operations

type ProcessCreateAndUpdateFields<T> = Omit<{
	// Omit AutoDate fields
	[K in keyof T as Extract<T[K], IsoAutoDateString> extends never ? K : never]: 
		// Convert FileNameString to File
		T[K] extends infer U ? 
			U extends (FileNameString | FileNameString[]) ? 
				U extends any[] ? File[] : File 
			: U
		: never
}, 'id'>

// Create type for Auth collections
export type CreateAuth<T> = {
	id?: RecordIdString
	email: string
	emailVisibility?: boolean
	password: string
	passwordConfirm: string
	verified?: boolean
} & ProcessCreateAndUpdateFields<T>

// Create type for Base collections
export type CreateBase<T> = {
	id?: RecordIdString
} & ProcessCreateAndUpdateFields<T>

// Update type for Auth collections
export type UpdateAuth<T> = Partial<
	Omit<ProcessCreateAndUpdateFields<T>, keyof AuthSystemFields>
> & {
	email?: string
	emailVisibility?: boolean
	oldPassword?: string
	password?: string
	passwordConfirm?: string
	verified?: boolean
}

// Update type for Base collections
export type UpdateBase<T> = Partial<
	Omit<ProcessCreateAndUpdateFields<T>, keyof BaseSystemFields>
>

// Get the correct create type for any collection
export type Create<T extends keyof CollectionResponses> =
	CollectionResponses[T] extends AuthSystemFields
		? CreateAuth<CollectionRecords[T]>
		: CreateBase<CollectionRecords[T]>

// Get the correct update type for any collection
export type Update<T extends keyof CollectionResponses> =
	CollectionResponses[T] extends AuthSystemFields
		? UpdateAuth<CollectionRecords[T]>
		: UpdateBase<CollectionRecords[T]>

// Type for usage with type asserted PocketBase instance
// https://github.com/pocketbase/js-sdk#specify-typescript-definitions

export type TypedPocketBase = {
	collection<T extends keyof CollectionResponses>(
		idOrName: T
	): RecordService<CollectionResponses[T]>
} & PocketBase
