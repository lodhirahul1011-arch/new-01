import React, { useMemo, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SvgProps } from 'react-native-svg';

import type { RootStackParamList } from '../../../navigation/RootNavigator';
import { AppAlert as Alert } from '../../../components/modals/AppAlert';
import BlueHeader from '../../../components/layout/BlueHeader';
import WhatsAppIcon from '../../../assets/icons/settings/help-supprot/whatsapp.svg';
import WhatsAppRightIcon from '../../../assets/icons/settings/help-supprot/whatassapp-right.svg';
import CallIcon from '../../../assets/icons/settings/help-supprot/call-blue.svg';
import RightArrowIcon from '../../../assets/icons/settings/help-supprot/right-arrow.svg';
import EmailIcon from '../../../assets/icons/settings/help-supprot/email.svg';
import DownArrowIcon from '../../../assets/icons/settings/help-supprot/down-arrow.svg';
import { useAppTranslation } from '../../../services/i18n';
import { logs } from '../../../services/logs';

type Props = NativeStackScreenProps<RootStackParamList, 'HelpSupport'>;

type ContactItem = {
  id: 'whatsapp' | 'call' | 'email';
  title: string;
  subtitle: string;
  Icon: React.ComponentType<SvgProps>;
  type: 'whatsapp' | 'call' | 'email';
  highlighted?: boolean;
};

type FaqItem = {
  id: string;
  tag: string;
  question: string;
  answer: string;
};

export default function HelpSupport({ navigation }: Props) {
  useAppTranslation();
  const [openFaqId, setOpenFaqId] = useState<string>('delivery');

  const contacts = useMemo<ContactItem[]>(
    () => [
      {
        id: 'whatsapp',
        title: 'WhatsApp Support',
        subtitle: 'Chat with us: +91 80000 12345',
        Icon: WhatsAppIcon,
        type: 'whatsapp',
        highlighted: true,
      },
      {
        id: 'call',
        title: 'Call Support',
        subtitle: '1800-123-DVAARI (Toll-free)',
        Icon: CallIcon,
        type: 'call',
      },
      {
        id: 'email',
        title: 'Email Support',
        subtitle: 'support@dvaari.in',
        Icon: EmailIcon,
        type: 'email',
      },
    ],
    [],
  );

  const faqs = useMemo<FaqItem[]>(
    () => [
      {
        id: 'setup',
        tag: 'Setup',
        question: 'How do I set up my Dvaari device?',
        answer:
          'Download the app, register your account, complete device linking, grant required permissions, and follow the on-screen setup instructions to finish installation.',
      },
      {
        id: 'delivery',
        tag: 'Delivery',
        question: 'How does delivery verification work?',
        answer:
          "When a delivery person arrives, select 'Delivery' mode on the device. The delivery person scans the QR code, which generates an OTP. Share this OTP with them to verify and complete the delivery.",
      },
      {
        id: 'doorbell',
        tag: 'Doorbell',
        question: 'What happens after 3 doorbell rings?',
        answer:
          'After repeated rings, the system can escalate the alert, notify backup users, and trigger additional monitoring based on your current security settings.',
      },
      {
        id: 'nfc',
        tag: 'NFC Cards',
        question: 'Can I add multiple NFC cards?',
        answer:
          'Yes, you can register multiple NFC cards and assign them to different users with different access levels from the app settings.',
      },
      {
        id: 'security',
        tag: 'Security',
        question: 'Is my data secure?',
        answer:
          'Yes, Dvaari is designed with secure authentication, controlled device access, and protected user data flows. Final security behavior depends on backend and deployment configuration.',
      },
      {
        id: 'notifications',
        tag: 'Notifications',
        question: 'How does delivery notification access work?',
        answer:
          'On Android, delivery detection uses Notification Access for delivery-related notifications from known SMS apps only. Dvaari checks notification text on your device for delivery keywords, sends structured delivery details and a hashed notification id to the backend, and does not retain the complete notification text.',
      },
    ],
    [],
  );

  const openWhatsapp = async () => {
    const phone = '918000012345';
    const message = 'Hello Dvaari support';
    const url = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(
      message,
    )}`;
    const fallbackUrl = `https://wa.me/${phone}?text=${encodeURIComponent(
      message,
    )}`;

    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        await Linking.openURL(fallbackUrl);
      }
    } catch (error) {
      logs.error('Could not open WhatsApp support link', error);
      Alert.alert('Unable to open', 'Could not open WhatsApp.');
    }
  };

  const openCall = async () => {
    try {
      await Linking.openURL('tel:1800123382274');
    } catch (error) {
      logs.error('Could not open support dialer', error);
      Alert.alert('Unable to call', 'Could not open phone dialer.');
    }
  };

  const openEmail = async () => {
    try {
      await Linking.openURL(
        'mailto:support@dvaari.in?subject=Dvaari Support Request',
      );
    } catch (error) {
      logs.error('Could not open support email app', error);
      Alert.alert('Unable to email', 'Could not open email app.');
    }
  };

  const handleContactPress = (type: ContactItem['type']) => {
    if (type === 'whatsapp') openWhatsapp();
    if (type === 'call') openCall();
    if (type === 'email') openEmail();
  };

  const toggleFaq = (id: string) => {
    setOpenFaqId(prev => (prev === id ? '' : id));
  };

  return (
    <SafeAreaView style={styles.safe}>
      <BlueHeader
        title="Help & Support"
        onBackPress={() => navigation.goBack()}
        compact
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Contact Us</Text>

        <View style={styles.contactWrap}>
          {contacts.map(item => {
            const isWhatsapp = item.highlighted;
            const ContactIcon = item.Icon;
            const RightIcon = isWhatsapp ? WhatsAppRightIcon : RightArrowIcon;

            return (
              <Pressable
                key={item.id}
                style={[
                  styles.contactCard,
                  isWhatsapp && styles.contactCardHighlighted,
                ]}
                onPress={() => handleContactPress(item.type)}
              >
                <View
                  style={[
                    styles.contactIconBox,
                    isWhatsapp && styles.contactIconBoxWhatsapp,
                  ]}
                >
                  <ContactIcon
                    width={styles.contactIcon.width}
                    height={styles.contactIcon.height}
                  />
                </View>

                <View style={styles.contactTextWrap}>
                  <Text style={styles.contactTitle}>{item.title}</Text>
                  <Text style={styles.contactSubtitle}>{item.subtitle}</Text>
                </View>

                <RightIcon
                  width={
                    isWhatsapp
                      ? styles.contactRightIcon.width
                      : styles.contactChevron.width
                  }
                  height={
                    isWhatsapp
                      ? styles.contactRightIcon.height
                      : styles.contactChevron.height
                  }
                />
              </Pressable>
            );
          })}
        </View>

        <View style={styles.supportHoursCard}>
          <Text style={styles.supportHoursTitle}>Support Hours</Text>
          <Text style={styles.supportHoursText}>
            Monday - Saturday: 9:00 AM - 6:00 PM IST
          </Text>
          <Text style={styles.supportHoursText}>Sunday: Closed</Text>
        </View>

        <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>

        <View style={styles.faqWrap}>
          {faqs.map(item => {
            const isOpen = openFaqId === item.id;

            return (
              <View
                key={item.id}
                style={[styles.faqCard, isOpen && styles.faqCardOpen]}
              >
                <Pressable
                  style={styles.faqTop}
                  onPress={() => toggleFaq(item.id)}
                >
                  <View style={styles.faqMain}>
                    <View style={styles.tagPill}>
                      <Text style={styles.tagText}>{item.tag}</Text>
                    </View>

                    <Text style={styles.faqQuestion}>{item.question}</Text>
                  </View>

                  {isOpen ? (
                    <DownArrowIcon
                      width={styles.faqArrow.width}
                      height={styles.faqArrow.height}
                      style={styles.faqArrow}
                    />
                  ) : (
                    <RightArrowIcon
                      width={styles.faqArrow.width}
                      height={styles.faqArrow.height}
                      style={styles.faqArrow}
                    />
                  )}
                </Pressable>

                {isOpen && (
                  <View style={styles.faqAnswerWrap}>
                    <Text style={styles.faqAnswer}>{item.answer}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 24,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 14,
  },

  contactWrap: {
    gap: 14,
  },

  contactCard: {
    minHeight: 86,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },

  contactCardHighlighted: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },

  contactIconBox: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },

  contactIconBoxWhatsapp: {
    backgroundColor: '#22C55E',
  },

  contactIcon: {
    width: 24,
    height: 24,
  },

  contactTextWrap: {
    flex: 1,
    marginRight: 12,
  },

  contactTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },

  contactSubtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    color: '#6B7280',
  },

  contactRightIcon: {
    width: 22,
    height: 22,
  },

  contactChevron: {
    tintColor: '#9CA3AF',
    width: 16,
    height: 16,
  },

  supportHoursCard: {
    marginTop: 18,
    marginBottom: 24,
    backgroundColor: '#FEF3C7',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F59E0B',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },

  supportHoursTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 10,
  },

  supportHoursText: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '500',
    color: '#92400E',
  },

  faqWrap: {
    gap: 14,
  },

  faqCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },

  faqCardOpen: {
    paddingBottom: 18,
  },

  faqTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },

  faqMain: {
    flex: 1,
  },

  tagPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 12,
  },

  tagText: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '800',
  },

  faqQuestion: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '800',
    color: '#111827',
  },

  faqArrow: {
    width: 18,
    height: 18,
    tintColor: '#9CA3AF',
    marginTop: 6,
  },

  faqAnswerWrap: {
    marginTop: 14,
    paddingRight: 18,
  },

  faqAnswer: {
    fontSize: 15,
    lineHeight: 28,
    fontWeight: '500',
    color: '#6B7280',
  },

  bottomSpacer: {
    height: 20,
  },
});
