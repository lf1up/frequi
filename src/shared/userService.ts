import type { AxiosResponse } from 'axios';
import axios from 'axios';

import type {
  AuthPayload,
  AuthResponse,
  BotDescriptors,
  AuthStorage,
  AuthStorageMulti,
  BotDescriptor,
} from '@/types';

const AUTH_LOGIN_INFO = 'ftAuthLoginInfo';
const APIBASE = '/api/v1';

export class UserService {
  private botId: string;

  constructor(botId: string) {
    console.log('botId', botId);
    this.botId = botId;
  }

  public updateBot(newValues: Partial<BotDescriptor>): void {
    const newInfo = this.getLoginInfo();
    Object.assign(newInfo, newValues);

    this.storeLoginInfo(newInfo);
  }

  /**
   * Stores info for current botId in the object of all bots.
   */
  private storeLoginInfo(loginInfo: AuthStorage): void {
    const allInfo = UserService.getAllLoginInfos();
    allInfo[this.botId] = loginInfo;
    localStorage.setItem(AUTH_LOGIN_INFO, JSON.stringify(allInfo));
  }

  private setAccessToken(token: string): void {
    const loginInfo = this.getLoginInfo();
    loginInfo.accessToken = token;
    this.storeLoginInfo(loginInfo);
  }

  /**
   * Store autorefresh preference for this bot instance
   * @param autoRefresh new autoRefresh value
   */
  public setAutoRefresh(autoRefresh: boolean): void {
    const loginInfo = this.getLoginInfo();
    loginInfo.autoRefresh = autoRefresh;
    this.storeLoginInfo(loginInfo);
  }

  /**
   * Retrieve full logininfo object (for all registered bots)
   * @returns
   */
  private static getAllLoginInfos(): AuthStorageMulti {
    const info = JSON.parse(localStorage.getItem(AUTH_LOGIN_INFO) || '{}');
    return info;
  }

  /**
   * Retrieve Login info object for the given bot
   * @returns Login Info object
   */
  public getLoginInfo(): AuthStorage {
    const info = UserService.getAllLoginInfos();
    if (this.botId in info && 'apiUrl' in info[this.botId] && 'refreshToken' in info[this.botId]) {
      return info[this.botId];
    }
    return {
      botName: '',
      apiUrl: '',
      username: '',
      refreshToken: '',
      accessToken: '',
      autoRefresh: false,
    };
  }

  setRefreshTokenExpired(): void {
    const loginInfo = this.getLoginInfo();
    loginInfo.refreshToken = '';
    loginInfo.accessToken = '';
    this.storeLoginInfo(loginInfo);
  }

  public static getAvailableBots(): BotDescriptors {
    const allInfo = UserService.getAllLoginInfos();
    const response: BotDescriptors = {};
    Object.keys(allInfo)
      .sort((a, b) => (allInfo[a].sortId ?? 0) - (allInfo[b].sortId ?? 0))
      .forEach((k, idx) => {
        response[k] = {
          botId: k,
          botName: allInfo[k].botName,
          botUrl: allInfo[k].apiUrl,
          sortId: allInfo[k].sortId ?? idx,
        };
      });

    return response;
  }

  public static getAvailableBotList(): string[] {
    const allInfo = UserService.getAllLoginInfos();
    return Object.keys(allInfo);
  }

  public getAutoRefresh(): boolean {
    return this.getLoginInfo().autoRefresh;
  }

  public getAccessToken(): string {
    return this.getLoginInfo().accessToken;
  }

  private getAPIUrl(): string {
    return this.getLoginInfo().apiUrl;
  }

  public logout(): void {
    console.log('Logging out');

    // Logout - removing info for this particular bot.
    const info = UserService.getAllLoginInfos();
    delete info[this.botId];
    localStorage.setItem(AUTH_LOGIN_INFO, JSON.stringify(info));
  }

  private async loginCall(auth: AuthPayload): Promise<AuthStorage> {
    //  Login using username / password
    const { data } = await axios.post<Record<string, never>, AxiosResponse<AuthResponse>>(
      `${auth.url}/api/v1/token/login`,
      {},
      {
        auth: { ...auth },
      },
    );
    if (data.access_token && data.refresh_token) {
      const obj: AuthStorage = {
        botName: auth.botName,
        apiUrl: auth.url,
        username: auth.username,
        accessToken: data.access_token || '',
        refreshToken: data.refresh_token || '',
        autoRefresh: true,
      };
      return Promise.resolve(obj);
    }
    return Promise.reject('login failed');
  }

  public async login(auth: AuthPayload) {
    const obj = await this.loginCall(auth);
    this.storeLoginInfo(obj);
  }

  public refreshToken(): Promise<string> {
    console.log('Refreshing token...');
    const token = this.getLoginInfo().refreshToken;
    return new Promise((resolve, reject) => {
      axios
        .post<Record<string, never>, AxiosResponse<AuthResponse>>(
          `${this.getAPIUrl()}${APIBASE}/token/refresh`,
          {},
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        )
        .then((response) => {
          if (response.data.access_token) {
            this.setAccessToken(response.data.access_token);
            // Return plain access token
            resolve(response.data.access_token);
          }
        })
        .catch((err) => {
          console.error(err);
          if (err.response && err.response.status === 401) {
            // Refresh token did not refresh.
            console.log('Refresh token did not refresh.');
            this.setRefreshTokenExpired();
          } else if (err.response && (err.response.status === 500 || err.response.status === 404)) {
            console.log('Bot seems to be offline... - retrying later');
          }
          reject(err);
        });
    });
  }

  public getBaseUrl(): string {
    const baseURL = this.getAPIUrl();
    if (baseURL === null) {
      // Relative url
      return APIBASE;
    }
    if (!baseURL.endsWith(APIBASE)) {
      return `${baseURL}${APIBASE}`;
    }
    return `${baseURL}${APIBASE}`;
  }

  public getBaseWsUrl(): string {
    const baseUrl = this.getBaseUrl();
    if (baseUrl.startsWith('http://')) {
      return baseUrl.replace('http://', 'ws://');
    }
    if (baseUrl.startsWith('https://')) {
      return baseUrl.replace('https://', 'wss://');
    }
    return '';
  }
}

export function useUserService(botId: string) {
  const userservice = new UserService(botId);
  return userservice;
}
