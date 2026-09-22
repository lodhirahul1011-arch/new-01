import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  NativeModules,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

import BlueHeader from '../../../components/layout/BlueHeader';
import { AppAlert as Alert } from '../../../components/modals/AppAlert';
import {
  useGetAnalyticsMonthlyReportQuery,
  type AnalyticsMonthlyReport,
} from '../../../services/api/analyticsApi';
import { API_BASE_URL } from '../../../config/env';
import { UI_VISIBILITY } from '../../../config/uiVisibility';
import { getAccessToken } from '../../../services/storage/tokenStorage';
import FilterSvg from '../../../assets/icons/analitics-tab/filter.svg';
import PdfSvg from '../../../assets/icons/analitics-tab/pdf-01.svg';
import ElementsSvg from '../../../assets/icons/analitics-tab/excelsheet.svg';
import ShareSvg from '../../../assets/icons/analitics-tab/share-08.svg';
import TickSvg from '../../../assets/icons/analitics-tab/tick-02.svg';
import { logs } from '../../../services/logs';
import { useAppTranslation } from '../../../services/i18n';

const { DeliveryImageDownload } = NativeModules as {
  DeliveryImageDownload?: {
    openReport?: (
      url: string,
      fileName: string,
      mimeType: string,
      headers?: Record<string, string>,
    ) => Promise<string>;
    shareReports?: (
      files: Array<{url: string; fileName: string; mimeType: string}>,
      headers?: Record<string, string>,
    ) => Promise<boolean>;
  };
};

type CategoryItem = {
  id: string;
  title: string;
  subtitle: string;
  count: number;
  percent: string;
};

type MemberItem = {
  id: string;
  initials: string;
  name: string;
  meta: string[];
  deliveries: number;
  tone: 'blue' | 'orange' | 'green';
};

type InsightItem = {
  id: string;
  label: string;
  count: number;
};

type CategoryFilter = {
  key: string;
  label: string;
};

const ANALYTICS_COPY = {
  monthlyReport: 'Monthly Report',
  totalDeliveries: 'Total Deliveries',
  deliveryCategories: 'Delivery Categories',
  byFamilyMember: 'By Family Member',
  expenseReports: 'Expense Reports',
} as const;

const FALLBACK_CATEGORY_ITEMS: CategoryItem[] = [
  {
    id: 'business',
    title: 'Business Deliveries',
    subtitle: 'Textile sample, supplies',
    count: 10,
    percent: '21%',
  },
  {
    id: 'household',
    title: 'Household',
    subtitle: 'Home, kitchen, household',
    count: 10,
    percent: '21%',
  },
  {
    id: 'personal',
    title: 'Personal',
    subtitle: 'Individual Purchases',
    count: 12,
    percent: '21%',
  },
];

const FALLBACK_FAMILY_MEMBERS: MemberItem[] = [
  {
    id: 'rajesh',
    initials: 'RK',
    name: 'Rajesh Kumar',
    meta: ['10 Business', '5 Personal'],
    deliveries: 15,
    tone: 'blue',
  },
  {
    id: 'meena',
    initials: 'M',
    name: 'Meena',
    meta: [],
    deliveries: 12,
    tone: 'orange',
  },
  {
    id: 'brothers-family',
    initials: 'B',
    name: 'Brothers family',
    meta: [],
    deliveries: 8,
    tone: 'green',
  },
  {
    id: 'others',
    initials: 'B',
    name: 'Others',
    meta: [],
    deliveries: 15,
    tone: 'green',
  },
];

const FALLBACK_INSIGHTS: InsightItem[] = [
  { id: 'approve', label: 'Approve this delivery', count: 2 },
  { id: 'recording', label: 'Video Recording saved', count: 47 },
  { id: 'otp', label: 'COD payments tracked', count: 6 },
  { id: 'receipts', label: 'Business receipts generated', count: 10 },
];

const isSecurityInsightVisible = (id: string) =>
  (UI_VISIBILITY.securityInsightImagesSaved || id !== 'recording') &&
  (UI_VISIBILITY.securityInsightCodPayments || id !== 'otp');

export default function AnalyticsStack() {
  const { t } = useAppTranslation();
  const [activeMonth, setActiveMonth] = useState<string>(
    getMonthKey(new Date()),
  );
  const [selectedCategory, setSelectedCategory] = useState<string>('personal');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<'pdf' | 'excel' | 'whatsapp' | null>(null);

  const { data, isLoading, isFetching, isError, refetch } =
    useGetAnalyticsMonthlyReportQuery({
      month: activeMonth,
      category: selectedCategory,
    });

  const report = data ?? null;
  const monthOptions = report?.availableMonths?.length
    ? report.availableMonths
    : [
        {
          key: activeMonth,
          label: formatMonthLabel(new Date()),
        },
      ];

  useEffect(() => {
    if (!report?.availableMonths?.length) return;
    const hasActiveMonth = report.availableMonths.some(
      item => item.key === activeMonth,
    );
    if (!hasActiveMonth) {
      setActiveMonth(
        report.availableMonths[report.availableMonths.length - 1]?.key ??
          activeMonth,
      );
    }
  }, [activeMonth, report]);

  const categoryFilters = useMemo<CategoryFilter[]>(() => {
    return report?.filters?.availableCategories?.length
      ? report.filters.availableCategories
      : [{ key: 'personal', label: 'Personal' }];
  }, [report]);

  const activeFilter = useMemo(() => {
    return (
      categoryFilters.find(item => item.key === selectedCategory) ??
      categoryFilters[0] ?? { key: 'all', label: 'Filter' }
    );
  }, [categoryFilters, selectedCategory]);

  const summary = useMemo(() => {
    if (!report) {
      return {
        title: ANALYTICS_COPY.totalDeliveries,
        value: 43,
        variance: t('comparison_vs_month', { percent: 12, month: 'apr' }),
      };
    }

    return {
      title: ANALYTICS_COPY.totalDeliveries,
      value: report.totalDeliveries,
      variance: buildComparisonLabel(report.comparison, t),
    };
  }, [report, t]);

  const categoryItems = useMemo(() => {
    if (!report?.categories?.length) {
      const fallbackItems = FALLBACK_CATEGORY_ITEMS.map(item => ({
        ...item,
        title: t(item.title),
        subtitle: t(getCategorySubtitleKey(item.id)),
      }));
      if (selectedCategory === 'all') {
        return fallbackItems;
      }
      return fallbackItems.filter(
        item => item.id === selectedCategory,
      );
    }

    const mappedItems = report.categories.map(item => ({
      id: item.key,
      title: t(item.label),
      subtitle: t(getCategorySubtitleKey(item.key)),
      count: item.count,
      percent: `${item.percentage}%`,
    }));
    if (selectedCategory === 'all') {
      return mappedItems;
    }
    return mappedItems.filter(item => item.id === selectedCategory);
  }, [report, selectedCategory, t]);

  const familyMembers = useMemo(() => {
    if (!report?.byFamilyMember?.length) {
      return FALLBACK_FAMILY_MEMBERS;
    }

    const tones: Array<MemberItem['tone']> = ['blue', 'orange', 'green'];

    return report.byFamilyMember.slice(0, 4).map((item, index) => ({
      id: item.memberId,
      initials: getInitials(item.name),
      name: item.name,
      meta: [],
      deliveries: item.count,
      tone: tones[Math.min(index, tones.length - 1)],
    }));
  }, [report]);

  const securityInsights = useMemo(() => {
    if (!report?.securityInsights) {
      return FALLBACK_INSIGHTS.filter(item =>
        isSecurityInsightVisible(item.id),
      ).map(item => ({
        ...item,
        label: t(item.label),
      }));
    }

    return [
      {
        id: 'approve',
        label: t('approve_this_delivery'),
        count: report.securityInsights.approvedDeliveries,
      },
      {
        id: 'recording',
        label: t('image_saved'),
        count: report.securityInsights.videoRecordingsSaved,
      },
      {
        id: 'otp',
        label: t('cod_payments_tracked'),
        count: report.securityInsights.codPaymentsTracked,
      },
      {
        id: 'receipts',
        label: t('business_receipts_generated'),
        count: report.securityInsights.businessReceiptsGenerated,
      },
    ].filter(item => isSecurityInsightVisible(item.id));
  }, [report, t]);

  const subtitle = report
    ? t('month_summary', { month: report.monthLabel })
    : t('monthly_summary');

  const openExportReport = async (type: 'pdf' | 'excel') => {
    const path =
      type === 'pdf'
        ? report?.expenseReports?.pdfUrl
        : report?.expenseReports?.excelUrl;

    if (!path) {
      logs.error('[analytics] report export URL missing', { type });
      Alert.alert(t('report_unavailable'), t('analytics_wait_to_load'));
      return;
    }

    try {
      setBusyAction(type);
      const token = await getAccessToken();
      if (!token) {
        logs.error('[analytics] report export token missing', { type });
        Alert.alert(t('session_expired'), t('sign_in_again_export_reports'));
        return;
      }

      if (Platform.OS !== 'android' || !DeliveryImageDownload?.openReport) {
        const url = buildExportUrl(path);
        const canOpen = await Linking.canOpenURL(url);
        if (!canOpen) throw new Error('Cannot open report URL');
        await Linking.openURL(url);
        logs.info('[analytics] report opened with platform fallback', {
          type,
          platform: Platform.OS,
        });
        return;
      }

      await DeliveryImageDownload.openReport(
        buildExportUrl(path),
        buildReportFileName(type, activeMonth, selectedCategory),
        getReportMimeType(type),
        { Authorization: `Bearer ${token}` },
      );
      logs.info('[analytics] Android report opened', { type });
    } catch (error) {
      logs.error('[analytics] report export failed', String(error));
      Alert.alert(t('export_failed'), t('unable_open_report_now'));
    } finally {
      setBusyAction(null);
    }
  };

  const shareOnWhatsapp = async () => {
    try {
      setBusyAction('whatsapp');
      if (!report?.expenseReports?.pdfUrl || !report?.expenseReports?.excelUrl) {
        logs.error('[analytics] report share URL missing');
        Alert.alert(t('report_unavailable'), t('analytics_wait_to_load'));
        return;
      }

      const token = await getAccessToken();
      if (!token) {
        logs.error('[analytics] report share token missing');
        Alert.alert(t('session_expired'), t('sign_in_again_share_reports'));
        return;
      }

      if (Platform.OS !== 'android' || !DeliveryImageDownload?.shareReports) {
        const pdfUrl = buildExportUrl(report.expenseReports.pdfUrl);
        const excelUrl = buildExportUrl(report.expenseReports.excelUrl);
        await Share.share({
          message: t('dvaari_reports_share_message', { pdfUrl, excelUrl }),
        });
        logs.info('[analytics] reports shared with platform fallback', Platform.OS);
        return;
      }

      await DeliveryImageDownload.shareReports(
        [
          {
            url: buildExportUrl(report.expenseReports.pdfUrl),
            fileName: buildReportFileName('pdf', activeMonth, selectedCategory),
            mimeType: getReportMimeType('pdf'),
          },
          {
            url: buildExportUrl(report.expenseReports.excelUrl),
            fileName: buildReportFileName('excel', activeMonth, selectedCategory),
            mimeType: getReportMimeType('excel'),
          },
        ],
        { Authorization: `Bearer ${token}` },
      );
      logs.info('[analytics] Android reports shared');
    } catch (error) {
      logs.error('[analytics] report share failed', String(error));
      Alert.alert(t('share_failed'), t('unable_share_reports_now'));
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} testID="analytics-screen">
      <BlueHeader
        title={ANALYTICS_COPY.monthlyReport}
        subtitle={subtitle}
        compact
        leftAligned
      />

      <View style={styles.monthBand}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.monthRow}
        >
          {monthOptions.map(item => {
            const isActive = item.key === activeMonth;

            return (
              <Pressable
                key={item.key}
                style={[styles.monthChip, isActive && styles.monthChipActive]}
                onPress={() => {
                  logs.info('[analytics] month selected', { month: item.key });
                  setActiveMonth(item.key);
                }}
                testID={isActive ? 'analytics-active-month' : undefined}
              >
                <Text
                  style={[
                    styles.monthChipText,
                    isActive && styles.monthChipTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.stateText}>{t('loading_analytics')}</Text>
          </View>
        ) : isError ? (
          <View style={styles.centerState}>
            <Text style={styles.stateTitle}>{t('could_not_load_analytics')}</Text>
            <Pressable
              style={styles.retryButton}
              onPress={() => {
                logs.info('[analytics] retry pressed');
                refetch();
              }}
            >
              <Text style={styles.retryButtonText}>{t('retry')}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {isFetching ? (
              <Text style={styles.refreshingText}>{t('refreshing_report')}</Text>
            ) : null}

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>{summary.title}</Text>
              <Text
                style={styles.summaryValue}
                testID="analytics-delivery-count"
              >
                {summary.value}
              </Text>
              <Text style={styles.summaryTrend}>{summary.variance}</Text>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {ANALYTICS_COPY.deliveryCategories}
              </Text>

              <Pressable disabled={true}
                style={styles.filterButton}
                onPress={() => setIsFilterOpen(true)}
              >
                <FilterSvg width={13} height={13} />
                <Text style={styles.filterButtonText}>
                  {t(activeFilter.label)}
                </Text>
              </Pressable>
            </View>

            <View style={styles.cardGroup}>
              {categoryItems.map(item => (
                <View key={item.id} style={styles.categoryCard}>
                  <View style={styles.categoryImage}>
                    <Text style={styles.categoryImageText}>
                      {getInitials(item.title)}
                    </Text>
                  </View>

                  <View style={styles.categoryBody}>
                    <View style={styles.categoryTopRow}>
                      <Text style={styles.categoryTitle}>{item.title}</Text>
                      <Text style={styles.categoryCount}>{item.count}</Text>
                    </View>

                    <View style={styles.categoryBottomRow}>
                      <Text style={styles.categorySubtitle}>
                        {item.subtitle}
                      </Text>
                      <Text style={styles.categoryPercent}>{item.percent}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            <Text style={styles.sectionTitle}>
              {ANALYTICS_COPY.byFamilyMember}
            </Text>

            <View style={styles.memberList}>
              {familyMembers.map(item => (
                <View key={item.id} style={styles.memberRow}>
                  <View
                    style={[styles.memberAvatar, avatarToneStyles[item.tone]]}
                  >
                    <Text
                      style={[
                        styles.memberAvatarText,
                        avatarTextToneStyles[item.tone],
                      ]}
                    >
                      {item.initials}
                    </Text>
                  </View>

                  <View style={styles.memberBody}>
                    <Text style={styles.memberName}>{item.name}</Text>

                    {item.meta.length ? (
                      <View style={styles.memberMetaRow}>
                        {item.meta.map(tag => (
                          <View key={tag} style={styles.memberTag}>
                            <Text style={styles.memberTagText}>{tag}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>

                  <Text style={styles.memberDeliveryText}>
                    {formatDeliveryCount(item.deliveries)}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionTitle}>
              {ANALYTICS_COPY.expenseReports}
            </Text>

            <View style={styles.actionsSection}>
              <View style={styles.actionsGrid}>
                <Pressable
                  style={styles.actionCard}
                  onPress={() => openExportReport('pdf')}
                  disabled={busyAction !== null}
                >
                  <View style={[styles.actionIconWrap, styles.actionIconBlue]}>
                    <PdfSvg width={18} height={18} />
                  </View>
                  <Text style={styles.actionText}>
                    {busyAction === 'pdf' ? t('opening_pdf') : t('pdf_report')}
                  </Text>
                </Pressable>

                <View style={styles.actionCardSpacer} />

                <Pressable
                  style={styles.actionCard}
                  onPress={() => openExportReport('excel')}
                  disabled={busyAction !== null}
                >
                  <View style={[styles.actionIconWrap, styles.actionIconGreen]}>
                    <ElementsSvg width={18} height={18} />
                  </View>
                  <Text style={styles.actionText}>
                    {busyAction === 'excel' ? t('opening_excel') : t('excel_export')}
                  </Text>
                </Pressable>
              </View>

              <Pressable
                style={[styles.actionCard, styles.actionCardWide]}
                onPress={shareOnWhatsapp}
                disabled={busyAction !== null}
              >
                <View style={[styles.actionIconWrap, styles.actionIconPurple]}>
                  <ShareSvg width={20} height={20} />
                </View>
                <Text style={styles.actionText}>
                  {busyAction === 'whatsapp' ? t('preparing_share') : t('whatsapp_share')}
                </Text>
              </Pressable>
            </View>

            <View style={styles.insightsCard}>
              <Text style={styles.insightsTitle}>{t('security_insights')}</Text>

              {securityInsights.map(item => (
                <View key={item.id} style={styles.insightRow}>
                  <View style={styles.insightLabelRow}>
                    <TickSvg width={14} height={14} />
                    <Text style={styles.insightText}>{item.label}</Text>
                  </View>

                  <Text style={styles.insightCount}>{item.count}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={isFilterOpen} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setIsFilterOpen(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.dropdownSheet}>
                {categoryFilters.map(item => {
                  const isSelected = item.key === selectedCategory;

                  return (
                    <Pressable
                      key={item.key}
                      style={[
                        styles.dropdownItem,
                        isSelected && styles.dropdownItemSelected,
                      ]}
                      onPress={() => {
                        logs.info('[analytics] category filter selected', { category: item.key });
                        setSelectedCategory(item.key);
                        setIsFilterOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.dropdownItemText,
                          isSelected && styles.dropdownItemTextSelected,
                        ]}
                      >
                        {t(item.label)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

function buildExportUrl(pathOrUrl: string) {
  return pathOrUrl.startsWith('http')
    ? pathOrUrl
    : `${API_BASE_URL}${pathOrUrl}`;
}

function getReportMimeType(type: 'pdf' | 'excel') {
  if (type === 'pdf') return 'application/pdf';
  return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}

function buildReportFileName(
  type: 'pdf' | 'excel',
  month: string,
  category: string,
) {
  const extension = type === 'pdf' ? 'pdf' : 'xlsx';
  const safeCategory = (category || 'all').replace(/[^A-Za-z0-9_-]+/g, '-');
  return `dvaari-${safeCategory}-report-${month}.${extension}`;
}

function buildComparisonLabel(
  comparison: AnalyticsMonthlyReport['comparison'] | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (!comparison) return t('comparison_vs_month', { percent: 0, month: t('previous_short') });

  const label = getComparisonShortMonth(comparison.previousMonthLabel);
  return t('comparison_vs_month', {
    percent: Math.abs(comparison.changePercentage),
    month: label,
  });
}

function getComparisonShortMonth(value?: string) {
  if (!value) return 'Prev';
  const lower = value.toLowerCase();
  if (lower.startsWith('september')) return 'Sept';
  const shortMonth = lower.slice(0, 3);
  return `${shortMonth.charAt(0).toUpperCase()}${shortMonth.slice(1)}`;
}

function formatDeliveryCount(count: number) {
  return `${count} ${count === 1 ? 'Delivery' : 'Deliveries'}`;
}

function getMonthKey(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

function formatMonthLabel(date: Date) {
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const normalizedMonth = month === 'Sep' ? 'Sept' : month;
  return `${normalizedMonth} ${date.getFullYear()}`;
}

function getCategorySubtitleKey(key: string) {
  if (key === 'business') return 'textile_sample_supplies';
  if (key === 'household') return 'home_kitchen_household';
  if (key === 'personal') return 'individual_purchases';
  return 'other_deliveries';
}

function getInitials(name: string) {
  const parts = String(name || 'Others')
    .trim()
    .split(/\s+/);
  const first = parts[0]?.[0] ?? 'O';
  const second = parts[1]?.[0] ?? '';
  return `${first}${second}`.toUpperCase();
}

const avatarToneStyles = StyleSheet.create({
  blue: {
    backgroundColor: '#E0E9FF',
  },
  orange: {
    backgroundColor: '#FFF1E1',
  },
  green: {
    backgroundColor: '#E8F7E8',
  },
});

const avatarTextToneStyles = StyleSheet.create({
  blue: {
    color: '#5B82FF',
  },
  orange: {
    color: '#F0A33B',
  },
  green: {
    color: '#6BBB79',
  },
});

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
  },

  monthBand: {
    backgroundColor: '#2563EB',
    paddingTop: 8,
    paddingBottom: 12,
  },

  monthRow: {
    gap: 10,
    paddingLeft: 10,
    paddingRight: 20,
  },

  monthChip: {
    minWidth: 94,
    height: 31,
    borderRadius: 4,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F57D6',
  },

  monthChipActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E4F1',
  },

  monthChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  monthChipTextActive: {
    color: '#2A61E8',
  },

  centerState: {
    paddingTop: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },

  stateTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#202228',
    marginBottom: 10,
  },

  stateText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '500',
    color: '#5D6270',
  },

  retryButton: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#DBEAFE',
  },

  retryButtonText: {
    color: '#1D4ED8',
    fontWeight: '800',
  },

  refreshingText: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
  },

  summaryCard: {
    marginTop: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E4EC',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
  },

  summaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#444852',
  },

  summaryValue: {
    marginTop: 10,
    fontSize: 47,
    lineHeight: 52,
    fontWeight: '800',
    color: '#21242C',
  },

  summaryTrend: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '600',
    color: '#2F66F3',
  },

  sectionHeader: {
    marginTop: 28,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#202228',
    marginBottom: 14,
  },

  filterButton: {
    height: 29,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#B9BEC8',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  filterButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#40454F',
  },

  cardGroup: {
    gap: 12,
    marginBottom: 22,
  },

  categoryCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E4EC',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },

  categoryImage: {
    width: 49,
    height: 49,
    borderRadius: 8,
    backgroundColor: '#F5F7FB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  categoryImageText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#2F66F3',
  },

  categoryBody: {
    flex: 1,
    marginLeft: 10,
  },

  categoryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },

  categoryTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#292D35',
  },

  categoryCount: {
    fontSize: 28,
    fontWeight: '800',
    color: '#2F66F3',
  },

  categoryBottomRow: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },

  categorySubtitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: '#5D6270',
  },

  categoryPercent: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5D6270',
  },

  memberList: {
    marginBottom: 24,
  },

  memberRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#C9CDD6',
    paddingVertical: 10,
  },

  memberAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  memberAvatarText: {
    fontSize: 16,
    fontWeight: '800',
  },

  memberBody: {
    flex: 1,
    paddingRight: 8,
  },

  memberName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#22242A',
  },

  memberMetaRow: {
    marginTop: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },

  memberTag: {
    borderRadius: 999,
    backgroundColor: '#EFF2F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  memberTagText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8690A3',
  },

  memberDeliveryText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2F66F3',
  },

  actionsSection: {
    marginBottom: 24,
  },

  actionsGrid: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 16,
  },

  actionCard: {
    flex: 1,
    minHeight: 110,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E4EC',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 16,
  },

  actionCardSpacer: {
    width: 16,
  },

  actionCardWide: {
    minHeight: 108,
  },

  actionIconWrap: {
    width: 43,
    height: 43,
    borderRadius: 21.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },

  actionIconBlue: {
    backgroundColor: '#E8F0FF',
  },

  actionIconGreen: {
    backgroundColor: '#EBFAEF',
  },

  actionIconPurple: {
    backgroundColor: '#EEF0FF',
  },

  actionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#292D35',
    textAlign: 'center',
  },

  insightsCard: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2F66F3',
    backgroundColor: '#EEF3FF',
    paddingHorizontal: 14,
    paddingVertical: 16,
  },

  insightsTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#282D35',
    marginBottom: 8,
  },

  insightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 3,
    gap: 8,
  },

  insightLabelRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  insightText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#30343C',
  },

  insightCount: {
    fontSize: 14,
    fontWeight: '500',
    color: '#202228',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  dropdownSheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  dropdownItem: {
    minHeight: 48,
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },

  dropdownItemSelected: {
    backgroundColor: '#F3F4F6',
  },

  dropdownItemText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
  },

  dropdownItemTextSelected: {
    fontWeight: '700',
    color: '#2563EB',
  },
});
