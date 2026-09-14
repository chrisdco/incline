import * as React from 'react';
import { Platform, View, TextInput, Pressable, Image, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useSSO } from '@clerk/expo';
import { useSignIn } from '@clerk/expo/legacy';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

import { Heading, Caption } from '@/components/common/text';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

WebBrowser.maybeCompleteAuthSession();

type ResetStep = 'idle' | 'sending' | 'verify' | 'resetting' | 'done';

export default function SignInScreen() {
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();
  const { startSSOFlow } = useSSO();
  const [emailAddress, setEmailAddress] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [googleLoading, setGoogleLoading] = React.useState(false);

  // Password reset state
  const [resetVisible, setResetVisible] = React.useState(false);
  const [resetStep, setResetStep] = React.useState<ResetStep>('idle');
  const [resetEmail, setResetEmail] = React.useState('');
  const [resetCode, setResetCode] = React.useState('');
  const [resetNewPassword, setResetNewPassword] = React.useState('');
  const [resetError, setResetError] = React.useState('');

  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    void WebBrowser.warmUpAsync();
    return () => { void WebBrowser.coolDownAsync(); };
  }, []);

  const onGooglePress = React.useCallback(async () => {
    setGoogleLoading(true);
    setError('');
    try {
      const result = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: Linking.createURL('/'),
      });
      if (result.createdSessionId) {
        await result.setActive?.({ session: result.createdSessionId });
        // Root gate binds Clerk user → local SQLite (wipes on account switch).
        router.replace('/');
      }
    } catch (err: any) {
      setError(err?.message ?? 'Google sign-in failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  }, [startSSOFlow, router]);

  const onSignInPress = async () => {
    if (!isLoaded) return;
    setLoading(true);
    setError('');
    try {
      const result = await signIn.create({ identifier: emailAddress, password });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        router.replace('/');
      }
    } catch (err: any) {
      setError(err?.errors?.[0]?.message ?? 'Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const openReset = () => {
    setResetEmail(emailAddress);
    setResetCode('');
    setResetNewPassword('');
    setResetError('');
    setResetStep('idle');
    setResetVisible(true);
  };

  const sendResetCode = async () => {
    if (!isLoaded || !resetEmail) return;
    setResetStep('sending');
    setResetError('');
    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: resetEmail,
      });
      // For reset_password_email_code, the next step is always entering the emailed code.
      setResetStep('verify');
    } catch (err: any) {
      setResetError(err?.errors?.[0]?.message ?? 'Could not send reset code. Check your email and try again.');
      setResetStep('idle');
    }
  };

  const submitResetCode = async () => {
    if (!isLoaded) return;
    setResetStep('resetting');
    setResetError('');
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: resetCode,
        password: resetNewPassword,
      });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        setResetStep('done');
        setResetVisible(false);
        setPassword('');
        router.replace('/');
      }
    } catch (err: any) {
      setResetError(err?.errors?.[0]?.message ?? 'Reset failed. Check the code and try again.');
      setResetStep('verify');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center px-6">
        <View className="mb-8 items-center">
          <Image
            source={require('../../../assets/images/icon.png')}
            style={{ width: 80, height: 80, borderRadius: 16 }}
            resizeMode="contain"
          />
          <Heading className="text-center">Incline</Heading>
          <Caption className="mt-2 text-center">
            Sign in to continue your training.
          </Caption>
        </View>

        <View className="gap-4">
          <Button
            size="lg"
            variant="outline"
            onPress={onGooglePress}
            disabled={googleLoading}>
            {googleLoading ? 'Opening Google…' : 'Continue with Google'}
          </Button>

          <View className="flex-row items-center gap-3">
            <View className="h-px flex-1 bg-border" />
            <Caption>or</Caption>
            <View className="h-px flex-1 bg-border" />
          </View>

          <View className="gap-1.5">
            <Caption>Email</Caption>
            <TextInput
              value={emailAddress}
              onChangeText={setEmailAddress}
              placeholder="you@example.com"
              placeholderTextColor="#6b7280"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              className="rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground"
            />
          </View>

          <View className="gap-1.5">
            <Caption>Password</Caption>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              placeholderTextColor="#6b7280"
              secureTextEntry
              autoComplete="password"
              className="rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground"
            />
          </View>

          <Pressable onPress={openReset} className="self-end">
            <Caption className="text-primary">Forgot password?</Caption>
          </Pressable>

          {error ? (
            <Caption className="text-destructive">{error}</Caption>
          ) : null}

          <Button size="lg" onPress={onSignInPress} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>

          <View className="items-center">
            <Pressable onPress={() => router.push('/(auth)/sign-up')}>
              <Text className="text-sm text-muted-foreground">
                Don&apos;t have an account? <Text className="font-semibold text-primary">Sign up</Text>
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Password Reset Modal */}
      <Modal visible={resetVisible} transparent animationType="fade" onRequestClose={() => setResetVisible(false)}>
        <View className="flex-1 items-center justify-center bg-black/50 px-6">
          <View className="w-full max-w-sm gap-4 rounded-2xl bg-card p-6">
            <Heading>
              {resetStep === 'verify' || resetStep === 'resetting' ? 'Enter Code' : 'Reset Password'}
            </Heading>
            <Caption className="-mt-2">
              {resetStep === 'verify' || resetStep === 'resetting'
                ? `Enter the code sent to ${resetEmail}`
                : 'Enter your email to receive a reset code.'}
            </Caption>

            {resetStep === 'idle' || resetStep === 'sending' ? (
              <>
                <View className="gap-1.5">
                  <Caption>Email</Caption>
                  <TextInput
                    value={resetEmail}
                    onChangeText={setResetEmail}
                    placeholder="you@example.com"
                    placeholderTextColor="#6b7280"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                    className="rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground"
                  />
                </View>
                {resetError ? <Caption className="text-destructive">{resetError}</Caption> : null}
                <Button size="lg" onPress={sendResetCode} disabled={resetStep === 'sending'}>
                  {resetStep === 'sending' ? 'Sending…' : 'Send Code'}
                </Button>
              </>
            ) : (
              <>
                <View className="gap-1.5">
                  <Caption>Verification Code</Caption>
                  <TextInput
                    value={resetCode}
                    onChangeText={setResetCode}
                    placeholder="123456"
                    placeholderTextColor="#6b7280"
                    autoCapitalize="none"
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    className="rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground"
                  />
                </View>
                <View className="gap-1.5">
                  <Caption>New Password</Caption>
                  <TextInput
                    value={resetNewPassword}
                    onChangeText={setResetNewPassword}
                    placeholder="Min 8 characters"
                    placeholderTextColor="#6b7280"
                    secureTextEntry
                    autoComplete="new-password"
                    className="rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground"
                  />
                </View>
                {resetError ? <Caption className="text-destructive">{resetError}</Caption> : null}
                <Button size="lg" onPress={submitResetCode} disabled={resetStep === 'resetting'}>
                  {resetStep === 'resetting' ? 'Resetting…' : 'Reset Password'}
                </Button>
              </>
            )}

            <Pressable onPress={() => setResetVisible(false)} className="items-center py-1">
              <Caption className="text-muted-foreground">Cancel</Caption>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
