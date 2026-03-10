import { supabase } from './supabaseClient'

export type ActionType = 'create' | 'update' | 'delete' | 'stage' | 'convert' | 'won' | 'lost'
export type EntityType = 'deal' | 'account' | 'prospect' | 'contact' | 'card' | 'invoice' | 'expense' | 'project_service' | 'ticket' | 'dr'

export async function logActivity(params: {
  action_type: ActionType
  entity_type: EntityType
  entity_id?: string
  entity_name: string
  detail?: string
}) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return

    const { error } = await supabase.from('activity_log').insert({
      user_email: user.email,
      action_type: params.action_type,
      entity_type: params.entity_type,
      entity_id: params.entity_id ?? null,
      entity_name: params.entity_name,
      detail: params.detail ?? null,
    })
    if (error) console.warn('logActivity DB error:', error.message)
  } catch (e) {
    // Silent fail — logging should never break the app
    console.warn('logActivity error:', e)
  }
}
