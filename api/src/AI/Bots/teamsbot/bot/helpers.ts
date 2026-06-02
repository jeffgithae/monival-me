import axios from 'axios';

async function getTranscriptToken(userToken: string, tenantId: string) {
    console.log('Getting token');
    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const formData = new URLSearchParams();
    formData.append('client_id', process.env.AZURE_CLIENT_ID || '');
    formData.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    formData.append('scope', 'https://graph.microsoft.com/.default');
    formData.append('client_secret', process.env.AZURE_CLIENT_SECRET || '');
    formData.append('requested_token_use', 'on_behalf_of');
    formData.append('assertion', userToken);

    try {
        const response = await axios.post(url, formData.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        console.log('Token received');
        return response.data;
    } catch (error: any) {
        console.error('Error in getting token:', error.response?.data || error.message);
    }
}

export async function getApplicationToken(tenantId: string) {
    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const formData = new URLSearchParams();
    formData.append('client_id', process.env.AZURE_CLIENT_ID || '');
    formData.append('grant_type', 'client_credentials');
    formData.append('scope', 'https://graph.microsoft.com/.default');
    formData.append('client_secret', process.env.AZURE_CLIENT_SECRET || '');

    try {
        const response = await axios.post(url, formData.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        console.log('Application token received');
        return response.data.access_token;
    } catch (error: any) {
        console.error('Error in getting application token:', error.response?.data || error.message);
    }
}

export async function processRequestBody(requestBody: any) {
    let combinedData: {
        calls: Record<string, any>;
        participants: Record<string, any>;
    } = {
        calls: {},
        participants: {},
    };

    if (requestBody && requestBody.value && Array.isArray(requestBody.value)) {
        requestBody.value.forEach((notification: any) => {
            const resource = notification.resource;
            const resourceUrl = notification.resourceUrl;
            const changeType = notification.changeType;
            const resourceData = notification.resourceData;

            if (resource.includes('/calls/')) {
                const callId = 'call';

                if (resource.includes('/participants')) {
                    // Handle participants in a call
                    if (!combinedData.participants[callId]) {
                        combinedData.participants[callId] = {
                            resourceUrl,
                            changes: [],
                            participantsData: [],
                        };
                    }
                    combinedData.participants[callId].changes.push(changeType);
                    combinedData.participants[callId].participantsData.push(resourceData);
                } else {
                    // Handle call details
                    if (!combinedData.calls[callId]) {
                        combinedData.calls[callId] = {
                            resourceUrl,
                            changes: [],
                            callData: [],
                        };
                    }
                    combinedData.calls[callId].changes.push(changeType);
                    combinedData.calls[callId].callData.push(resourceData);
                }
            }
        });
    }

    return combinedData;
}

export function getOrganizerDetails(participantsArray: any[]) {
    for (let group of participantsArray) {
        for (let participant of group) {
            if (participant.meetingRole === 'organizer' && participant.info?.identity?.user) {
                return participant.info.identity.user.tenantId;
            }
        }
    }
    return null; // Return null if no organizer is found
}

export async function getCallToken(tenantId: string) {
    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const formData = new URLSearchParams();
    formData.append('client_id', process.env.AZURE_CLIENT_ID || '');
    formData.append('grant_type', 'client_credentials');
    formData.append('scope', 'https://graph.microsoft.com/.default');
    formData.append('client_secret', process.env.AZURE_CLIENT_SECRET || '');

    try {
        const response = await axios.post(url, formData.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        return response.data.access_token;
    } catch (error: any) {
        console.error('Error in getting token:', error.response?.data || error.message);
    }
}

async function getMeetingTranscriptIDs(meetingId: string, token: string) {
    console.log('Getting transcript IDs');
    const url = `https://graph.microsoft.com/v1.0/me/onlineMeetings/${meetingId}/transcripts`;

    try {
        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        let transcripts = response.data.value.map((item: any) => {
            return { id: item.id };
        });

        console.log('Transcript IDs received');
        return transcripts;
    } catch (error: any) {
        console.error('Error in get meeting transcript id:', error.response?.data || error.message);
    }
}

function parseVttToJson(vttContent: string) {
    const lines = vttContent.split('\n');
    const entries: { startTime: string; endTime: string; text: string; speaker?: string }[] = [];
    let currentEntry: { startTime: string; endTime: string; text: string; speaker?: string } | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (!line || line === 'WEBVTT') continue;

        if (line.includes('-->')) {
            const [startTime, endTime] = line.split('-->').map((t) => t.trim());
            currentEntry = { startTime, endTime, text: '' };
            entries.push(currentEntry);
        } else if (currentEntry) {
            if (line.startsWith('<v ')) {
                const match = line.match(/<v ([^>]+)>(.*)/);
                if (match) {
                    currentEntry.speaker = match[1].trim();
                    currentEntry.text += match[2].trim() + ' ';
                } else {
                    currentEntry.text += line + ' ';
                }
            } else {
                currentEntry.text += line + ' ';
            }
        }
    }
    entries.forEach((entry) => {
        if (entry.text) entry.text = JSON.parse(entry.text.trim());
    });

    return { transcript: entries };
    return entries;
}

async function getMeetingTranscript(meetingID: string, transcriptID: string, token: string) {
    console.log('Getting transcript content');

    const url = `https://graph.microsoft.com/v1.0/me/onlineMeetings/${meetingID}/transcripts/${transcriptID}/metadataContent`;

    console.log('Meeting ID right now:', meetingID);

    try {
        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        // console.log("Transcript content received \n\n", response.data, "\n\n")
        let transcript = response.data;

        let jsonTranscript = parseVttToJson(transcript);
        console.log('Transcript parsed');

        return jsonTranscript;
    } catch (error: any) {
        console.error('Error in meeting transcript:', error.response?.data || error.message);
    }
}

export async function extractEventType(input: string) {
    const match = input.match(/"eventType"\s*:\s*"([^"]+)"/);
    return match ? match[1] : null;
}

export async function getTranscript(meetingJoinID: string, userToken: string, tenantId?: string) {
    let token = userToken;
    const url = `https://graph.microsoft.com/v1.0/me/onlineMeetings?$filter=joinMeetingIdSettings/joinMeetingId%20eq%20'${meetingJoinID}'`;

    try {
        console.log('Getting meeting IDs');
        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        let meetings = response.data.value.map((item) => {
            return { id: item.id, subject: item.subject };
        });

        console.log('Meeting IDs received');

        let transcripts = await getMeetingTranscriptIDs(meetings[0].id, token);
        let latestTranscript = await getMeetingTranscript(meetings[0].id, transcripts[transcripts.length - 1].id, token);

        return latestTranscript;
    } catch (error: any) {
        console.error('Error in get transcript:', error.response?.data || error.message);
    }
}
