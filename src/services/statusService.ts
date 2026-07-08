import { supabase } from './supabase';
import { isSupabaseStorageError, memoryStore } from './memoryStore';

const CHATBOT_DISMISS_DAYS = 7;

interface CardStatus {
  showCESDCard: boolean;
  showChatbotCard: boolean;
}

export const getCardStatus = async (user_id: string): Promise<CardStatus> => {
  const [cesdResult, consentResult] = await Promise.all([
    supabase
      .from('cesd_results')
      .select('score')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from('consents')
      .select('chatbot_optin, chatbot_card_dismissed_at')
      .eq('user_id', user_id)
      .maybeSingle(),
  ]);

  if (cesdResult.error && !isSupabaseStorageError(cesdResult.error)) throw new Error(cesdResult.error.message);
  if (consentResult.error && !isSupabaseStorageError(consentResult.error)) throw new Error(consentResult.error.message);

  const memoryCesd = memoryStore.cesdResults
    .filter((row) => row.user_id === user_id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const memoryConsent = memoryStore.consents.get(user_id);

  const latestScore: number = cesdResult.data?.score ?? memoryCesd?.score ?? 0;
  const isHighRisk = latestScore >= 16;
  const showCESDCard = isHighRisk;

  const chatbotOptin: boolean = consentResult.data?.chatbot_optin ?? memoryConsent?.chatbot_optin ?? false;
  const dismissedAt: string | null = consentResult.data?.chatbot_card_dismissed_at ?? null;

  const isDismissedRecently = dismissedAt
    ? Date.now() - new Date(dismissedAt).getTime() < CHATBOT_DISMISS_DAYS * 24 * 60 * 60 * 1000
    : false;

  const showChatbotCard = isHighRisk && chatbotOptin && !isDismissedRecently;
  return { showCESDCard, showChatbotCard };
};

export const dismissChatbotCard = async (user_id: string) => {
  const dismissedAt = new Date().toISOString();
  const { error } = await supabase
    .from('consents')
    .upsert({ user_id, chatbot_card_dismissed_at: dismissedAt }, { onConflict: 'user_id' });

  if (error) {
    if (!isSupabaseStorageError(error)) throw new Error(error.message);
    const current = memoryStore.consents.get(user_id);
    memoryStore.consents.set(user_id, {
      user_id,
      data_collection: current?.data_collection ?? true,
      notification: current?.notification ?? true,
      chatbot_optin: current?.chatbot_optin ?? true,
      updated_at: dismissedAt,
    });
  }
};
