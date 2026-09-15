import { useCallback, useMemo, useState } from 'react';

import { PriceAdjustContext, SelectedLocation } from './types';
import { formatCurrency, resolveGooglePlacesKey, resolveOpenAIApiKey } from './utils';

interface PriceEstimateProps {
  showModal: (config: { title: string; message: string }) => void;
  systemPrompt: string;
  priceAdjust?: (price: number, ctx: PriceAdjustContext) => { price: number; note?: string };
}

interface DrivingInfo {
  distanceMeters: number;
  durationSeconds: number;
  distanceMiles: number;
  durationMinutes: number;
}

export function usePriceEstimate({ showModal, systemPrompt, priceAdjust }: PriceEstimateProps) {
  const openAiApiKey = useMemo(resolveOpenAIApiKey, []);
  const googlePlacesApiKey = useMemo(resolveGooglePlacesKey, []);
  const [priceQuote, setPriceQuote] = useState<string | null>(null);
  const [priceNote, setPriceNote] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [isPriceLoading, setIsPriceLoading] = useState(false);

  const resetPriceState = useCallback(() => {
    setPriceQuote(null);
    setPriceNote(null);
    setPriceError(null);
    setIsPriceLoading(false);
  }, []);

  const restorePrice = useCallback((next: {
    priceQuote?: string | null;
    priceNote?: string | null;
    priceError?: string | null;
  }) => {
    setPriceQuote(next.priceQuote ?? null);
    setPriceNote(next.priceNote ?? null);
    setPriceError(next.priceError ?? null);
    setIsPriceLoading(false);
  }, []);

  const fetchDrivingInfo = useCallback(async (start: SelectedLocation, end: SelectedLocation): Promise<DrivingInfo | null> => {
    if (!googlePlacesApiKey) return null;

    try {
      const params = new URLSearchParams({
        origin: `${start.coordinate.latitude},${start.coordinate.longitude}`,
        destination: `${end.coordinate.latitude},${end.coordinate.longitude}`,
        key: googlePlacesApiKey,
        mode: 'driving',
      });
      const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`);
      const data = await response.json();

      if (data.status === 'OK' && data.routes?.[0]?.legs?.[0]) {
        const leg = data.routes[0].legs[0];
        const distanceMeters = leg.distance?.value ?? 0;
        const durationSeconds = leg.duration?.value ?? 0;
        return {
          distanceMeters,
          durationSeconds,
          distanceMiles: distanceMeters / 1609.344,
          durationMinutes: durationSeconds / 60,
        };
      }
      return null;
    } catch (error) {
      console.warn('Failed to fetch driving info:', error);
      return null;
    }
  }, [googlePlacesApiKey]);

  const fetchPrice = useCallback(async (taskDescription: string, options: { start?: SelectedLocation | null; end?: SelectedLocation | null; needsTruck?: boolean } = {}) => {
    const { start, end, needsTruck } = options;
    setIsPriceLoading(true);
    setPriceQuote(null);
    setPriceNote(null);
    setPriceError(null);

    if (!openAiApiKey) {
      setIsPriceLoading(false);
      setPriceError('Price estimate unavailable (missing OpenAI key).');
      return;
    }

    try {
      let drivingInfo: DrivingInfo | null = null;
      if (start && end) {
        drivingInfo = await fetchDrivingInfo(start, end);
      }

      const startDetails = start ? `${start.description} (lat ${start.coordinate.latitude.toFixed(4)}, lng ${start.coordinate.longitude.toFixed(4)})` : 'not provided';
      const endDetails = end ? `${end.description} (lat ${end.coordinate.latitude.toFixed(4)}, lng ${end.coordinate.longitude.toFixed(4)})` : 'not provided';
      const drivingDetails = drivingInfo
        ? `Driving distance: ${drivingInfo.distanceMiles.toFixed(2)} miles, Estimated driving time: ${Math.round(drivingInfo.durationMinutes)} minutes`
        : 'Driving distance: not available';

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openAiApiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [`Task description: ${taskDescription}`, `Start location: ${startDetails}`, `End location: ${endDetails}`, drivingDetails].join('\n'),
            },
          ],
        }),
      });

      if (!response.ok) throw new Error('Failed to fetch price estimate');
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim().length === 0) throw new Error('Missing completion content');
      const parsed = JSON.parse(content);

      if (parsed.safety_concern && parsed.safety_message) {
        showModal({ title: 'Safety notice', message: String(parsed.safety_message) });
        setPriceError('This request needs review.');
        return;
      }

      if (parsed.needs_clarification && parsed.clarification_prompt) {
        showModal({ title: 'A bit more detail', message: String(parsed.clarification_prompt) });
        setPriceError('Add a few more details to see a price.');
        return;
      }

      let price = Number(parsed.price);
      if (!Number.isFinite(price)) throw new Error('Invalid price value');

      let note: string | undefined;
      if (priceAdjust) {
        const adjusted = priceAdjust(price, {
          needsTruck,
          drivingMiles: drivingInfo?.distanceMiles,
          drivingMinutes: drivingInfo?.durationMinutes,
        });
        price = adjusted.price;
        note = adjusted.note;
      }

      setPriceQuote(formatCurrency(Math.max(0, Math.round(price))));
      if (note) setPriceNote(note);
    } catch (error) {
      console.warn('Failed to fetch price estimate', error);
      setPriceError('Unable to estimate price right now.');
    } finally {
      setIsPriceLoading(false);
    }
  }, [fetchDrivingInfo, openAiApiKey, priceAdjust, showModal, systemPrompt]);

  return { priceQuote, priceNote, priceError, isPriceLoading, resetPriceState, restorePrice, fetchPrice };
}
