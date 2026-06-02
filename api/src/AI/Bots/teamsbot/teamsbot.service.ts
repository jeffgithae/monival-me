import { Injectable } from '@nestjs/common';
import { CloudAdapter, ConfigurationBotFrameworkAuthentication, ConfigurationServiceClientCredentialFactory } from 'botbuilder';
import { Bot } from './bot/bot';
import { processRequestBody, getCallToken, getTranscript } from './bot/helpers';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class TeamsbotService {
    private adapter: CloudAdapter;
    private bot: Bot;
    private callMeetingIdMap: Record<string, string> = {};
    transcriptsByCallId: any;
    transcriptPollingIntervals: {};
    pollingIntervals: {};

    constructor() {
        const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
            MicrosoftAppId: process.env.AZURE_CLIENT_ID ?? '',
            MicrosoftAppPassword: process.env.AZURE_CLIENT_SECRET ?? '',
            MicrosoftAppType: 'MultiTenant',
        });

        const botFrameworkAuthentication = new ConfigurationBotFrameworkAuthentication({}, credentialsFactory);

        this.adapter = new CloudAdapter(botFrameworkAuthentication);

        this.bot = new Bot();
        // Initialize these objects
        this.callMeetingIdMap = {};
        this.transcriptsByCallId = {};
        this.transcriptPollingIntervals = {};
        this.pollingIntervals = {};
    }

    async joinGroupCall(tenantId: string, joinMeetingId: string, meetingPasscode: string, callbackUri: string) {
        const url = 'https://graph.microsoft.com/v1.0/communications/calls';
        const body = {
            '@odata.type': '#microsoft.graph.call',
            callbackUri: callbackUri, // Webhook endpoint for call events
            requestedModalities: ['audio'],
            mediaConfig: {
                '@odata.type': '#microsoft.graph.serviceHostedMediaConfig',
                preFetchMedia: [],
            },
            meetingInfo: {
                '@odata.type': '#microsoft.graph.joinMeetingIdMeetingInfo',
                joinMeetingId: joinMeetingId,
                passcode: meetingPasscode,
            },
            tenantId: tenantId,
        };

        try {
            const accessToken = await getCallToken(tenantId);

            console.log('Attempting to join the call...');
            const response = await axios.post(url, body, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            });

            const callId = response.data.id;
            console.log(`Successfully joined call with ID: ${callId}`);
            // Store the meeting ID mapping for later transcript retrieval
            this.callMeetingIdMap[callId] = joinMeetingId;

            this.transcriptsByCallId[callId] = [];
            console.log(`Initialized transcript tracking for call ${callId}`);

            // try {
            //     await this.subscribeToCallEvents(callId, accessToken, callbackUri);
            //     console.log("Successfully subscribed to call roster events");
            // } catch (error) {
            //     // Log the error but continue - don't fail the entire call join
            //     console.error("Failed to subscribe to roster events, but continuing with call", error.message);
            // }

            return response.data;
        } catch (error: any) {
            console.error('Error creating call:', error.response?.data || error.message);
            // throw new Error('Failed to create call: ' + (error.message || 'Unknown error'));
        }
    }

    async subscribeToCallEvents(callId: string, accessToken: string, callbackUri: string) {
        // Subscribe to roster updates to know when participants join/leave
        const subscribeUrl = `https://graph.microsoft.com/v1.0/communications/calls/${callId}/subscribeToRoster`;

        try {
            const response = await axios.post(
                subscribeUrl,
                {},
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                },
            );
            console.log('Subscribed to roster events successfully:', response.data);
            return response.data;
        } catch (error: any) {
            console.error('Error subscribing to roster events:', error.response?.data || error.message);
            // console.log("Error subscribing to roster events: ", error);
            // throw new Error('Failed to subscribe to roster events');
        }
    }

    async leaveCall(callId: string, accessToken: string, userToken?: string, meetingJoinID?: string) {
        const leaveUrl = `https://graph.microsoft.com/v1.0/communications/calls/${callId}`;

        try {
            await axios.delete(leaveUrl, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            });

            console.log('Bot left the call successfully.');

            try {
                const transcript = await getTranscript(meetingJoinID ?? '', userToken ?? '');

                console.log('Transcript content: ', transcript);
            } catch (error: any) {
                console.error('Error fetching transcript after leaving call:', error.response?.data || error.message);
            }
        } catch (error: any) {
            console.error('Error leaving the call:', error.response?.data || error.message);
            //   throw new Error('Failed to leave the call');
        }
    }

    async getParticipants(reqBody: any): Promise<
        Array<{
            userId: string;
            displayName?: string;
            meetingRole: string;
            participantId: string;
        }>
    > {
        try {
            // Extract participants data from the request body
            const participants = reqBody?.participants?.call?.participantsData.flat();

            // Map and filter participants to extract required details
            const participantDetails = [...participants]
                .filter((participant: any) => participant.info.identity.user)
                .map((participant: any) => ({
                    userId: participant.info.identity.user.id,
                    displayName: participant.info.identity.user.displayName,
                    meetingRole: participant.meetingRole,
                    participantId: participant.id,
                }));

            return participantDetails;
        } catch (error) {
            console.error('Error processing messages:', error);
            throw error; // Re-throw the error for handling upstream
        }
    }

    async getCallParticipants(callId: string, tenantId: string): Promise<Array<{ id: string; name: string; isBot: boolean }>> {
        const url = `https://graph.microsoft.com/v1.0/communications/calls/${callId}/participants`;
        const accessToken = await getCallToken(tenantId);

        // console.log("callId in getCallParticipants: ", callId);

        try {
            const response = await axios.get(url, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            });

            // Log all participants for debugging
            console.log(
                `Current participants in call ${callId}:`,
                response.data.value.map((p: any) => ({
                    id: p.id,
                    name: p.info?.identity?.user?.displayName || 'Bot',
                    isBot: p.info?.identity?.application !== undefined,
                })),
            );

            return response.data.value.map((participant: any) => ({
                id: participant.id,
                name: participant.info?.identity?.user?.displayName || 'Bot',
                isBot: participant.info?.identity?.application !== undefined, // Check if the participant is a bot
            }));
        } catch (error: any) {
            console.error('Error fetching call participants:', error.response?.data || error.message);
            throw new Error('Failed to fetch call participants');
        }
    }

    async processMessages(reqBody: any) {
        if (reqBody['@odata.type']) {
            let combinedData = await processRequestBody(reqBody);
            const processedInfo = combinedData;
            const processedParticipants = await this.getParticipants(processedInfo);
            // console.log('\n', JSON.stringify(processedInfo));
            // console.log('\n Processed info participants: ', JSON.stringify(processedParticipants), new Date());

            // Extract call ID if available
            let callId = null;
            if (processedInfo.calls.call?.callData && processedInfo.calls.call.callData.length > 0 && processedInfo.calls.call.callData[0].id) {
                callId = processedInfo.calls.call.callData[0].id;
            }
        }
    }

    private async checkAndLeaveIfLastParticipant(callId: string, organizationId: string, userId: string, joinCallId: string) {
        if (!callId) return;

        try {
            let existingBotInfo, userBotInfo;

            if (!existingBotInfo) {
                console.log('No bot information found for this organization.');
                return;
            }
            const participants = await this.getCallParticipants(callId, existingBotInfo.tenantId);
            console.log(`Remaining participants: ${participants.length}`);

            // Check if the bot is the only participant left
            const allAreBots = participants.every((item) => item.name.toLowerCase() === 'bot');
            console.log('All participants are bots:', allAreBots);
            // if (participants.length === 1 && participants[0].isBot)
            if (allAreBots) {
                console.log('Bot is the last participant, leaving the call...');
                const accessToken = await getCallToken(existingBotInfo.tenantId);
                await this.leaveCall(callId, accessToken, userBotInfo.botAccessToken, joinCallId);
                console.log('Bot successfully left the call');
            }
        } catch (error) {
            console.error('Error checking participants:', error);
        }
    }

    private extractCallIdFromResourceUrl(resourceUrl: string): string {
        // Extract call ID from resource URL like: /communications/calls/{id}/participants/{id}
        const match = resourceUrl.match(/\/communications\/calls\/([^\/]+)/);
        return match ? match[1] : '';
    }

    async processCallEvents(event: any, organizationId: string, userId: string, joinCallId: string) {
        try {
            if (event.value && Array.isArray(event.value)) {
                //   console.log('Array of events received');
                for (const notification of event.value) {
                    // Check for participant changes
                    if (notification.resourceUrl && notification.resourceUrl.includes('/participants')) {
                        const callId = this.extractCallIdFromResourceUrl(notification.resourceUrl);
                        console.log('Call ID:', callId);
                        // console.log('Notification change type:', notification.changeType);
                        if (notification.changeType === 'updated') {
                            console.log('Change event detected');
                            await this.checkAndLeaveIfLastParticipant(callId, organizationId, userId, joinCallId);
                        }
                    }
                }
            } else if (event.resourceUrl) {
                if (event.resourceUrl) {
                    if (event.resourceUrl.includes('/participants') && event.changeType === 'deleted') {
                        const callId = this.extractCallIdFromResourceUrl(event.resourceUrl);
                        console.log('Change event detected');
                        await this.checkAndLeaveIfLastParticipant(callId, organizationId, userId, joinCallId);
                    }
                }
            }
            return `Event processed`;
        } catch (error) {
            console.error('Error processing call event:', error);
            return `Error processing event`;
        }
    }

    async handleIncomingMessage(req: any, res: any) {
        await this.adapter.process(req, res, async (context) => {
            await this.bot.run(context);
        });
    }
}
