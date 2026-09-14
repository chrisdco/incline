import * as React from 'react';
import { Platform, View, TextInput, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useSSO } from '@clerk/expo';
import { useSignUp } from '@clerk/expo/legacy';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

import { Heading, Caption } from '@/components/common/text';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

WebBrowser.maybeCompleteAuthSession();

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp, setActive, isLoaded } = useSignUp();
  const { startSSOFlow } = useSSO();
  const [emailAddress, setEmailAddress] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [pendingVerification, setPendingVerification] = React.useState(false);
  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [googleLoading, setGoogleLoading] = React.useState(false);

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
        // Root gate binds Clerk user → local SQLite, then sends to onboarding/app.
        router.replace('/');
      }
    } catch (err: any) {
      setError(err?.message ?? 'Google sign-up failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  }, [startSSOFlow, router]);

  const onSignUpPress = async () => {
    if (!isLoaded) return;
    setLoading(true);
    setError('');
    try {
      await signUp.create({ emailAddress, password });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err: any) {
      setError(err?.errors?.[0]?.message ?? 'Sign up failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const onVerifyPress = async () => {
    if (!isLoaded) return;
    setLoading(true);
    setError('');
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        router.replace('/');
      }
    } catch (err: any) {
      setError(err?.errors?.[0]?.message ?? 'Verification failed. Check the code and try again.');
    } finally {
      setLoading(false);
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
          <Heading className="text-center">
            {pendingVerification ? 'Verify email' : 'Create account'}
          </Heading>
          <Caption className="mt-2 text-center">
            {pendingVerification
              ? `We sent a code to ${emailAddress}`
              : 'Start tracking your workouts today.'}
          </Caption>
        </View>

        {!pendingVerification ? (
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
                placeholder="At least 8 characters"
                placeholderTextColor="#6b7280"
                secureTextEntry
                autoComplete="new-password"
                className="rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground"
              />
            </View>

            {error ? (
              <Caption className="text-destructive">{error}</Caption>
            ) : null}

            <Button size="lg" onPress={onSignUpPress} disabled={loading}>
              {loading ? 'Creating account…' : 'Sign up'}
            </Button>

            <View className="items-center">
              <Pressable onPress={() => router.push('/(auth)/sign-in')}>
                <Text className="text-sm text-muted-foreground">
                  Already have an account? <Text className="font-semibold text-primary">Sign in</Text>
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View className="gap-4">
            <View className="gap-1.5">
              <Caption>Verification code</Caption>
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="Enter the 6-digit code"
                placeholderTextColor="#6b7280"
                keyboardType="number-pad"
                autoComplete="one-time-code"
                className="rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground"
              />
            </View>

            {error ? (
              <Caption className="text-destructive">{error}</Caption>
            ) : null}

            <Button size="lg" onPress={onVerifyPress} disabled={loading}>
              {loading ? 'Verifying…' : 'Verify email'}
            </Button>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
