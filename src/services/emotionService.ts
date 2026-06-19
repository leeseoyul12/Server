import { supabase } from './supabase';

export interface EmotionLog {
  user_id: string;
  emoji: string;
  note?: string;
}

export const saveEmotionLog = async (data: EmotionLog) => {
  const { data: result, error } = await supabase
    .from('emotion_logs')
    .insert([{ ...data }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return result;
};

export const getEmotionHistory = async (user_id: string) => {
  const { data, error } = await supabase
    .from('emotion_logs')
    .select('*')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
};
