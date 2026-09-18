import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Text} from 'react-native';

import AnalyticsStack from '../src/navigation/tabs/stacks/AnalyticsStack';

jest.mock('../src/services/i18n', () => ({
  useAppTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'month_summary') return `${options?.month} summary`;
      if (key === 'comparison_vs_month') {
        return `${options?.percent}% vs ${options?.month}`;
      }
      return key
        .split('_')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    },
  }),
}));

jest.mock('../src/services/api/analyticsApi', () => ({
  useGetAnalyticsMonthlyReportQuery: () => ({
    data: {
      month: '2025-05',
      monthLabel: 'May 2025',
      availableMonths: [
        {key: '2025-03', label: 'Mar 2025'},
        {key: '2025-04', label: 'Apr 2025'},
        {key: '2025-05', label: 'May 2025'},
      ],
      selectedCategory: 'all',
      totalDeliveries: 43,
      successful: 40,
      rejected: 3,
      comparison: {
        previousMonth: '2025-04',
        previousMonthLabel: 'April 2025',
        previousTotal: 38,
        changeCount: 5,
        changePercentage: 12,
      },
      categories: [
        {key: 'business', label: 'Business Deliveries', count: 10, percentage: 23},
        {key: 'household', label: 'Household', count: 10, percentage: 23},
        {key: 'personal', label: 'Personal', count: 12, percentage: 28},
      ],
      filters: {
        availableCategories: [
          {key: 'all', label: 'Filter'},
          {key: 'business', label: 'Business'},
        ],
      },
      byFamilyMember: [
        {memberId: '1', name: 'Rajesh Kumar', count: 15},
        {memberId: '2', name: 'Meena', count: 12},
      ],
      securityInsights: {
        approvedDeliveries: 2,
        videoRecordingsSaved: 47,
        codPaymentsTracked: 6,
        businessReceiptsGenerated: 10,
      },
      expenseReports: {
        pdfUrl: '/api/v1/analytics/export/pdf?month=2025-05',
        excelUrl: '/api/v1/analytics/export/excel?month=2025-05',
        whatsappShareUrl: '/api/v1/analytics/share/whatsapp?month=2025-05',
        whatsappText: 'test',
        whatsappDeepLink: 'https://wa.me/?text=test',
      },
    },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    canGoBack: () => false,
    goBack: jest.fn(),
  }),
}));

jest.mock('../src/components/layout/BlueHeader', () => {
  const React = require('react');
  const {View, Text} = require('react-native');

  return function MockBlueHeader({
    title,
    subtitle,
  }: {
    title: string;
    subtitle?: string;
  }) {
    return (
      <View>
        <Text>{title}</Text>
        {subtitle ? <Text>{subtitle}</Text> : null}
      </View>
    );
  };
});

jest.mock('../src/assets/icons/analitics-tab/filter.svg', () => 'FilterSvg');
jest.mock('../src/assets/icons/analitics-tab/pdf-01.svg', () => 'PdfSvg');
jest.mock('../src/assets/icons/analitics-tab/excelsheet.svg', () => 'ElementsSvg');
jest.mock('../src/assets/icons/analitics-tab/share-08.svg', () => 'ShareSvg');
jest.mock('../src/assets/icons/analitics-tab/tick-02.svg', () => 'TickSvg');

function getAllText(tree: renderer.ReactTestRenderer) {
  return tree.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat()
    .filter((c: unknown) => typeof c === 'string' || typeof c === 'number')
    .join(' ');
}

describe('AnalyticsStack', () => {
  beforeAll(() => {
    const originalWarn = console.warn;
    jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      const first = args[0];
      if (
        typeof first === 'string' &&
        first.includes('SafeAreaView has been deprecated')
      ) {
        return;
      }
      originalWarn(...(args as Parameters<typeof console.warn>));
    });
  });

  afterAll(() => {
    (console.warn as unknown as jest.Mock).mockRestore();
  });

  it('renders the monthly analytics report screen', () => {
    let tree!: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(<AnalyticsStack />);
    });

    const text = getAllText(tree);

    expect(tree.root.findByProps({testID: 'analytics-screen'})).toBeTruthy();
    expect(tree.root.findByProps({testID: 'analytics-delivery-count'})).toBeTruthy();
    expect(text).toContain('Monthly Report');
    expect(text).toContain('May 2025 summary');
    expect(text).toContain('Delivery Categories');
    expect(text).toContain('By Family Member');
    expect(text).toContain('Expense Reports');
    expect(text).toContain('Security Insights');
    expect(text).toContain('43');

    act(() => {
      tree.unmount();
    });
  });
});
