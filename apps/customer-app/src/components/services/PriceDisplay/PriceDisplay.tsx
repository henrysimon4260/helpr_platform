import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { usePriceDisplayStyles } from './styles';
import { PriceDisplayProps } from './types';

export const PriceDisplay: React.FC<PriceDisplayProps> = ({
  priceQuote,
  priceNote,
  priceError,
  isLoading,
  title = 'Helpr',
  emptyMessage = 'Enter details to see price',
  confirmedMessage = 'Price confirmed on next page',
}) => {
  const styles = usePriceDisplayStyles();

  return (
    <View style={styles.container}>
      <View style={styles.textContainer}>
        <View style={styles.titleContainer}>
          <Text style={styles.titleText}>{title}</Text>
        </View>
        <View style={styles.subtitleContainer}>
          <Text style={styles.subtitleText}>
            {priceQuote ? confirmedMessage : emptyMessage}
          </Text>
        </View>
      </View>
      <View style={styles.quoteContainer}>
        {isLoading ? (
          <ActivityIndicator size="small" color="#0c4309" />
        ) : (
          <>
            {priceQuote ? (
              <View style={styles.quoteRow}>
                <Text style={[styles.quoteText, styles.quotePrice]} numberOfLines={1}>
                  {priceQuote}
                </Text>
                <Text style={styles.estimateText}>est.</Text>
              </View>
            ) : (
              <>
                {priceError && (
                  <Text style={[styles.quoteText, styles.quoteTextError]} numberOfLines={3}>
                    {priceError}
                  </Text>
                )}
                {priceNote && (
                  <Text style={styles.noteText} numberOfLines={2}>
                    {priceNote}
                  </Text>
                )}
              </>
            )}
          </>
        )}
      </View>
    </View>
  );
};






