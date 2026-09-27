import type { PropsWithChildren } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../lib/theme";

// Standard padding + scroll wrapper used by every patient tab. Keeps the look
// consistent without a heavyweight UI lib.
export function ScreenContainer({
  children,
  scroll = true,
  refreshControl,
}: PropsWithChildren<{ scroll?: boolean; refreshControl?: React.ReactElement }>) {
  const Wrapper = scroll ? ScrollView : View;
  const wrapperProps = scroll
    ? { contentContainerStyle: styles.scroll, refreshControl }
    : { style: styles.scroll };
  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <Wrapper {...wrapperProps}>{children}</Wrapper>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
});
