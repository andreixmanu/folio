import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import BudgetsScreen from '@/app/(budget)/budgets';
import CategoriesScreen from '@/app/categories';
import TransactionDetailScreen from '@/app/transaction/[id]';
import { recentTransactions } from '@/features/budget/analytics';
import { applyCategories } from '@/features/budget/categorize';
import { createMockBudgetData } from '@/features/budget/mock-data';
import { DEFAULT_BUDGETS } from '@/features/budget/model';
import { useBudgetStore } from '@/features/budget/store';

import { renderWithProviders } from '../test/test-utils';

const mockSearchParams: { id?: string } = { id: '' };

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual<typeof import('react-native-safe-area-context')>(
    'react-native-safe-area-context',
  );
  return { ...actual, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

jest.mock('expo-router', () => ({
  router: {
    navigate: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => false),
  },
  useLocalSearchParams: () => mockSearchParams,
  useFocusEffect: jest.fn(),
}));

jest.mock('@/features/budget/data-source', () => {
  const actual = jest.requireActual<typeof import('@/features/budget/data-source')>(
    '@/features/budget/data-source',
  );
  return { ...actual, budgetSource: actual.createMockBudgetSource(() => new Date(), 0) };
});

function reset() {
  useBudgetStore.setState({
    userRules: [],
    categoryOverrides: {},
    overrideMerchants: {},
    budgets: DEFAULT_BUDGETS.map((budget) => ({ ...budget })),
    customCategories: [],
  });
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  reset();
  await act(async () => {
    await useBudgetStore.persist.rehydrate();
  });
  reset();
  jest.mocked(router.push).mockClear();
});

afterEach(async () => {
  await settle();
});

describe('categories screen', () => {
  test('Budget links to the management screen', async () => {
    await renderWithProviders(<BudgetsScreen />);
    await fireEvent.press(await screen.findByTestId('manage-categories'));
    expect(router.push).toHaveBeenCalledWith('/categories');
  });

  test('create, rename and delete a custom category', async () => {
    await renderWithProviders(<CategoriesScreen />);
    expect(await screen.findByTestId('builtin-category-groceries')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('category-create'));
    await fireEvent.changeText(screen.getByTestId('category-name-input'), 'Alimentari');
    expect(await screen.findByTestId('category-name-error')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('category-name-input'), 'Regali');
    await fireEvent.press(screen.getByTestId('category-icon-Gift'));
    await fireEvent.press(screen.getByTestId('category-color-3'));
    await fireEvent.press(screen.getByTestId('category-editor-save'));
    await settle();

    const [created] = useBudgetStore.getState().customCategories;
    expect(created).toMatchObject({ label: 'Regali', icon: 'Gift', custom: true });
    if (!created) return;
    expect(screen.getByTestId(`custom-category-${created.id}`)).toBeTruthy();

    await fireEvent.press(screen.getByTestId(`custom-category-${created.id}`));
    await fireEvent.changeText(screen.getByTestId('category-name-input'), 'Regali di Natale');
    await fireEvent.press(screen.getByTestId('category-editor-save'));
    await settle();
    expect(useBudgetStore.getState().customCategories[0]?.label).toBe('Regali di Natale');

    await fireEvent.press(screen.getByTestId(`custom-category-${created.id}`));
    await fireEvent.press(screen.getByTestId('category-delete'));
    await fireEvent.press(screen.getByTestId('category-delete-confirm'));
    await settle();
    expect(useBudgetStore.getState().customCategories).toEqual([]);
    expect(screen.queryByTestId(`custom-category-${created.id}`)).toBeNull();
  });

  test('transaction picker creates a category inline, assigns it, and can go back to auto', async () => {
    const txs = applyCategories(createMockBudgetData(new Date()).transactions, [], {});
    const tx = recentTransactions(txs, 5)[0];
    if (!tx) throw new Error('no movement');
    mockSearchParams.id = tx.id;

    await renderWithProviders(<TransactionDetailScreen />);
    await fireEvent.press(await screen.findByTestId('tx-category'));
    await fireEvent.press(screen.getByTestId('category-option-new'));
    await fireEvent.changeText(screen.getByTestId('category-name-input'), 'Spese pazze');
    await fireEvent.press(screen.getByTestId('category-editor-save'));
    await settle();
    const created = useBudgetStore.getState().customCategories[0];
    expect(created?.label).toBe('Spese pazze');
    if (!created) return;
    await fireEvent.press(screen.getByTestId('category-sheet-apply'));
    await settle();
    expect(useBudgetStore.getState().categoryOverrides[tx.id]).toBe(created.id);
    expect(screen.getAllByText('Spese pazze').length).toBeGreaterThan(0);
    expect(screen.getByTestId('tx-category-source').props.children).toBe('Scelta da te');

    await fireEvent.press(screen.getByTestId('tx-category'));
    await fireEvent.press(screen.getByTestId('category-reset'));
    await settle();
    expect(useBudgetStore.getState().categoryOverrides[tx.id]).toBeUndefined();
    expect(screen.getByTestId('tx-category-source').props.children).toBe('Assegnata automaticamente');
  });
});
