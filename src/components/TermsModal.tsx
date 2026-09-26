/**
 * TermsModal.tsx
 *
 * A simple full-screen modal showing terms text, with an "I Accept" button.
 * Replace the placeholder text with your real terms/privacy content whenever
 * you have it ready.
 */

import React from 'react';
import { Modal, View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';

type Props = {
  visible: boolean;
  onAccept: () => void;
  onClose: () => void;
};

export default function TermsModal({ visible, onAccept, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <Text style={styles.title}>Terms & Conditions</Text>
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 24 }}>
          <Text style={styles.body}>
            {`This is placeholder terms & conditions text.

By using this app, you agree to let us store your phone number, vehicle details, and location data associated with your registered vehicle(s) for the purpose of enabling the parking and contact features of this service.

Replace this text with your actual Terms of Service and Privacy Policy before launch.`}
          </Text>
        </ScrollView>
        <Pressable style={styles.acceptButton} onPress={onAccept}>
          <Text style={styles.acceptButtonText}>I Accept</Text>
        </Pressable>
        <Pressable style={styles.closeLink} onPress={onClose}>
          <Text style={styles.closeLinkText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF', padding: 24, paddingTop: 60 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 16, color: '#111827' },
  scroll: { flex: 1, marginBottom: 16 },
  body: { fontSize: 15, lineHeight: 22, color: '#374151' },
  acceptButton: {
    backgroundColor: '#2F6FED',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  acceptButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  closeLink: { alignItems: 'center', paddingVertical: 8 },
  closeLinkText: { color: '#6B7280', fontSize: 14 },
});
