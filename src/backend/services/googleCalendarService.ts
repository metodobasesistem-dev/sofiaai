import axios from 'axios';
import { supabase } from '../lib/supabaseClient.js';

export class GoogleCalendarService {
  private clientId = process.env.GOOGLE_CLIENT_ID;
  private clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  /**
   * Gets a fresh access token using the user's stored refresh token.
   */
  async getAccessToken(userId: string): Promise<string | null> {
    try {
      // 1. Fetch refresh token from profiles
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('google_refresh_token')
        .eq('id', userId)
        .single();

      if (error || !profile?.google_refresh_token) {
        console.warn(`[GoogleCalendarService] No refresh token for user ${userId}`);
        return null;
      }

      console.log(`[GoogleCalendarService] Refresh token found for user ${userId}. Attempting to refresh access token.`);
      const response = await axios.post('https://oauth2.googleapis.com/token', {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: profile.google_refresh_token,
        grant_type: 'refresh_token'
      }, { timeout: 10000 });

      const accessToken = response.data.access_token;
      if (accessToken) {
        console.log(`[GoogleCalendarService] Access token obtained successfully for user ${userId}`);
      }
      return accessToken;
    } catch (err: any) {
      console.error('[GoogleCalendarService] Refresh token error:', err.response?.data || err.message);
      return null;
    }
  }

  /**
   * Fetches busy slots for a specific date range using the FreeBusy API.
   */
  async getBusySlots(userId: string, calendarId: string, date: string) {
    const token = await this.getAccessToken(userId);
    if (!token) return [];

    const timeMin = `${date}T00:00:00Z`;
    const timeMax = `${date}T23:59:59Z`;

    try {
      const response = await axios.post(
        `https://www.googleapis.com/calendar/v3/freeBusy`,
        {
          timeMin,
          timeMax,
          items: [{ id: calendarId }]
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000
        }
      );

      const busy = response.data.calendars[calendarId]?.busy || [];
      return busy.map((b: any) => ({
        start: b.start,
        end: b.end
      }));
    } catch (err) {
      console.error('[GoogleCalendarService] Error fetching freebusy:', err);
      return [];
    }
  }

  /**
   * Creates a new event in the user's selected Google Calendar.
   */
  async createEvent(userId: string, calendarId: string, eventData: {
    summary: string;
    description: string;
    start: string; // ISO String
    end: string;   // ISO String
  }) {
    const token = await this.getAccessToken(userId);
    if (!token) throw new Error('Could not obtain Google access token');

    try {
      const response = await axios.post(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
        {
          summary: eventData.summary,
          description: eventData.description,
          start: { dateTime: eventData.start },
          end: { dateTime: eventData.end },
          reminders: {
            useDefault: true
          }
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000
        }
      );

      console.log(`[GoogleCalendarService] Event created successfully: ${response.data.id}`);
      return response.data;
    } catch (err: any) {
      console.error('[GoogleCalendarService] Error creating event:', err.response?.data || err.message);
      if (err.response?.data?.error) {
         console.error('[GoogleCalendarService] Google API Error Details:', JSON.stringify(err.response.data.error, null, 2));
      }
      throw err;
    }
  }

  /**
   * Deletes an existing event from the user's selected Google Calendar.
   */
  async deleteEvent(userId: string, calendarId: string, eventId: string) {
    const token = await this.getAccessToken(userId);
    if (!token) throw new Error('Could not obtain Google access token');

    try {
      await axios.delete(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000
        }
      );
      return { success: true };
    } catch (err: any) {
      console.error('[GoogleCalendarService] Error deleting event:', err.response?.data || err.message);
      // If event was already deleted or doesn't exist, we don't need to crash.
      if (err.response?.status === 404 || err.response?.status === 410) {
        return { success: true, message: 'Event already gone' };
      }
      throw err;
    }
  }
}

export const googleCalendarService = new GoogleCalendarService();
