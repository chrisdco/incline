import * as React from 'react';
import { Platform, View, Pressable, Image, ScrollView, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useSSO } from '@clerk/expo';
import { useSignIn } from '@clerk/expo/legacy';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

import { Heading, Caption, Text } from '@/components/common/text';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, PasswordInput } from '@/components/ui/input';
import { motionControl } from '@/styles/motion';

const LINK_TARGET = { minHeight: motionControl.minHeight, justifyContent: 'center' } as const;

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
        if (result.setActive) await result.setActive({ session: result.createdSessionId });
        // Root gate binds Clerk user → local SQLite (wipes on account switch).
        router.replace('/');
      }
    } catch (err: any) {
      setError(err?.message ?? 'Google sign-in failed. Please try again.');
    }
    setGoogleLoading(false);
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
    }
    setLoading(false);
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

  const verifying = resetStep === 'verify' || resetStep === 'resetting';

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Same keyboard handling as onboarding: the primary button stays visible. */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerClassName="flex-grow justify-center px-6 py-8" keyboardShouldPersistTaps="handled">
          <View className="mb-8 items-center">
            <Image
              source={require('../../../assets/images/icon.png')}
              style={{ width: 80, height: 80, borderRadius: 16 }}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
              accessible={false}
            />
            <Heading className="mt-4 text-center">Incline</Heading>
            <Caption className="mt-2 text-center">Sign in to continue your training.</Caption>
          </View>

          <View className="gap-4">
            <Button size="lg" variant="outline" onPress={onGooglePress} disabled={googleLoading}>
              {googleLoading ? 'Opening Google…' : 'Continue with Google'}
            </Button>

            <View className="flex-row items-center gap-3">
              <View className="h-px flex-1 bg-border" />
              <Caption>or</Caption>
              <View className="h-px flex-1 bg-border" />
            </View>

            <View className="gap-1.5">
              <Caption>Email</Caption>
              <Input
                value={emailAddress}
                onChangeText={setEmailAddress}
                placeholder="you@example.com"
                accessibilityLabel="Email"
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
              />
            </View>

            <View className="gap-1.5">
              <Caption>Password</Caption>
              <PasswordInput
                value={password}
                onChangeText={setPassword}
                placeholder="Your password"
                accessibilityLabel="Password"
                autoComplete="password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={() => { void onSignInPress(); }}
              />
            </View>

            <Pressable
              onPress={openReset}
              className="self-end"
              style={LINK_TARGET}
              accessibilityRole="button"
              accessibilityLabel="Forgot password?">
              <Caption className="text-primary-text">Forgot password?</Caption>
            </Pressable>

            {error ? (
              <Caption className="text-destructive" accessibilityLiveRegion="polite">{error}</Caption>
            ) : null}

            <Button size="lg" onPress={onSignInPress} disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>

            <View className="items-center">
              <Pressable
                onPress={() => router.push('/(auth)/sign-up')}
                style={LINK_TARGET}
                accessibilityRole="link"
                accessibilityLabel="Don't have an account? Sign up">
                <Text className="text-sm text-muted-foreground">
                  Don&apos;t have an account? <Text className="font-semibold text-primary-text">Sign up</Text>
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Password reset: the app Dialog, not a hand-rolled Modal (#176). */}
      <Dialog
        open={resetVisible}
        onOpenChange={setResetVisible}
        title={verifying ? 'Enter code' : 'Reset password'}
        description={verifying ? `Enter the code sent to ${resetEmail}` : 'Enter your email to receive a reset code.'}
        footer={
          <Button variant="ghost" onPress={() => setResetVisible(false)}>
            Cancel
          </Button>
        }>
        <View className="gap-4">
          {!verifying ? (
            <>
              <View className="gap-1.5">
                <Caption>Email</Caption>
                <Input
                  value={resetEmail}
                  onChangeText={setResetEmail}
                  placeholder="you@example.com"
                  accessibilityLabel="Email"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  textContentType="emailAddress"
                />
              </View>
              {resetError ? <Caption className="text-destructive" accessibilityLiveRegion="polite">{resetError}</Caption> : null}
              <Button size="lg" onPress={sendResetCode} disabled={resetStep === 'sending'}>
                {resetStep === 'sending' ? 'Sending…' : 'Send code'}
              </Button>
            </>
          ) : (
            <>
              <View className="gap-1.5">
                <Caption>Verification code</Caption>
                <Input
                  value={resetCode}
                  onChangeText={setResetCode}
                  placeholder="123456"
                  accessibilityLabel="Verification code"
                  autoCapitalize="none"
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                />
              </View>
              <View className="gap-1.5">
                <Caption>New password</Caption>
                <PasswordInput
                  value={resetNewPassword}
                  onChangeText={setResetNewPassword}
                  placeholder="Min 8 characters"
                  accessibilityLabel="New password"
                  autoComplete="new-password"
                  textContentType="newPassword"
                />
              </View>
              {resetError ? <Caption className="text-destructive" accessibilityLiveRegion="polite">{resetError}</Caption> : null}
              <Button size="lg" onPress={submitResetCode} disabled={resetStep === 'resetting'}>
                {resetStep === 'resetting' ? 'Resetting…' : 'Reset password'}
              </Button>
            </>
          )}
        </View>
      </Dialog>
    </SafeAreaView>
  );
}
