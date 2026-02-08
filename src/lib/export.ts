/**
 * Export utilities for generating CSV and formatted expense reports
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { Receipt, Trip } from './types/database';

/**
 * Format a number as currency
 */
function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Format a date for CSV
 */
function formatDateForCSV(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * Escape CSV field (handle commas, quotes, newlines)
 */
function escapeCSVField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Generate CSV content from receipts
 */
export function generateReceiptsCSV(receipts: Receipt[], trip?: Trip): string {
  const headers = ['Date', 'Merchant', 'Category', 'Amount', 'Currency', 'Status', 'Notes'];
  
  const rows = receipts.map(receipt => [
    formatDateForCSV(new Date(receipt.date)),
    escapeCSVField(receipt.merchant),
    receipt.category || 'other',
    receipt.amount.toFixed(2),
    receipt.currency,
    receipt.status,
    '', // Notes column (empty for now)
  ]);

  // Calculate totals by currency
  const totalsByCurrency = receipts.reduce((acc, receipt) => {
    acc[receipt.currency] = (acc[receipt.currency] || 0) + receipt.amount;
    return acc;
  }, {} as Record<string, number>);

  // Build CSV content
  let csv = headers.join(',') + '\n';
  csv += rows.map(row => row.join(',')).join('\n');
  
  // Add summary section
  csv += '\n\n';
  csv += 'Summary\n';
  csv += `Total Receipts,${receipts.length}\n`;
  
  Object.entries(totalsByCurrency).forEach(([currency, total]) => {
    csv += `Total (${currency}),${formatCurrency(total, currency)}\n`;
  });

  if (trip) {
    csv += '\n';
    csv += `Trip,${escapeCSVField(trip.name)}\n`;
    csv += `Destination,${escapeCSVField(trip.destination)}\n`;
    csv += `Dates,${formatDateForCSV(new Date(trip.start_date))} - ${formatDateForCSV(new Date(trip.end_date))}\n`;
  }

  return csv;
}

/**
 * Generate formatted text report from receipts
 */
export function generateReceiptsTextReport(receipts: Receipt[], trip?: Trip): string {
  let report = '';

  if (trip) {
    report += `EXPENSE REPORT\n`;
    report += `${'='.repeat(50)}\n\n`;
    report += `Trip: ${trip.name}\n`;
    report += `Destination: ${trip.destination}\n`;
    report += `Dates: ${formatDateForCSV(new Date(trip.start_date))} - ${formatDateForCSV(new Date(trip.end_date))}\n\n`;
  } else {
    report += `EXPENSE REPORT\n`;
    report += `${'='.repeat(50)}\n\n`;
  }

  // Group by category
  const byCategory = receipts.reduce((acc, receipt) => {
    const cat = receipt.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(receipt);
    return acc;
  }, {} as Record<string, Receipt[]>);

  // Print each category
  Object.entries(byCategory).forEach(([category, categoryReceipts]) => {
    report += `${category.toUpperCase()}\n`;
    report += `${'-'.repeat(50)}\n`;
    
    categoryReceipts.forEach(receipt => {
      const date = formatDateForCSV(new Date(receipt.date));
      const amount = formatCurrency(receipt.amount, receipt.currency);
      report += `${date}  ${receipt.merchant.padEnd(25)}  ${amount.padStart(12)}\n`;
    });
    
    const categoryTotal = categoryReceipts.reduce((sum, r) => sum + r.amount, 0);
    report += `${' '.repeat(38)}Subtotal: ${formatCurrency(categoryTotal, categoryReceipts[0].currency).padStart(12)}\n\n`;
  });

  // Grand total
  const totalsByCurrency = receipts.reduce((acc, receipt) => {
    acc[receipt.currency] = (acc[receipt.currency] || 0) + receipt.amount;
    return acc;
  }, {} as Record<string, number>);

  report += `${'='.repeat(50)}\n`;
  report += `TOTAL\n`;
  Object.entries(totalsByCurrency).forEach(([currency, total]) => {
    report += `${currency}: ${formatCurrency(total, currency)}\n`;
  });
  report += `\nTotal Receipts: ${receipts.length}\n`;

  return report;
}

/**
 * Export receipts as CSV file
 */
export async function exportReceiptsAsCSV(receipts: Receipt[], trip?: Trip): Promise<void> {
  try {
    const csv = generateReceiptsCSV(receipts, trip);
    const fileName = trip 
      ? `${trip.name.replace(/[^a-z0-9]/gi, '_')}_expenses.csv`
      : `expenses_${new Date().toISOString().split('T')[0]}.csv`;
    
    const fileUri = `${FileSystem.documentDirectory}${fileName}`;
    
    await FileSystem.writeAsStringAsync(fileUri, csv, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export Expense Report',
        UTI: 'public.comma-separated-values-text',
      });
    } else {
      throw new Error('Sharing is not available on this device');
    }
  } catch (error) {
    console.error('Failed to export CSV:', error);
    throw error;
  }
}

/**
 * Export receipts as formatted text report
 */
export async function exportReceiptsAsText(receipts: Receipt[], trip?: Trip): Promise<void> {
  try {
    const report = generateReceiptsTextReport(receipts, trip);
    const fileName = trip 
      ? `${trip.name.replace(/[^a-z0-9]/gi, '_')}_report.txt`
      : `expense_report_${new Date().toISOString().split('T')[0]}.txt`;
    
    const fileUri = `${FileSystem.documentDirectory}${fileName}`;
    
    await FileSystem.writeAsStringAsync(fileUri, report, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/plain',
        dialogTitle: 'Export Expense Report',
      });
    } else {
      throw new Error('Sharing is not available on this device');
    }
  } catch (error) {
    console.error('Failed to export text report:', error);
    throw error;
  }
}
