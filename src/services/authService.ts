import { supabase } from './supabase';

export const signUp = async (email: string, password: string, nickname: string) => {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nickname },
  });

  if (error) throw new Error(error.message);

  await supabase
    .from('users')
    .upsert({ id: data.user.id, email, nickname }, { onConflict: 'id' });

  return { user_id: data.user.id, nickname };
};

export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) throw new Error(error.message);

  const nickname =
    data.user.user_metadata?.nickname ??
    data.user.email?.split('@')[0] ??
    'User';

  return {
    access_token: data.session.access_token,
    user_id: data.user.id,
    email: data.user.email,
    nickname,
  };
};

export const signOut = async (accessToken: string) => {
  const { error } = await supabase.auth.admin.signOut(accessToken);
  if (error) throw new Error(error.message);
};
