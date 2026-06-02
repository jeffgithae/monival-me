import { Body, Controller, Post, Req, Res, Param, Get, Query } from '@nestjs/common';
import { TeamsbotService } from './teamsbot.service';
import { ApiParam, ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import { getCallToken, getTranscript } from './bot/helpers';
import axios from 'axios';

@Controller('teamsbot')
@ApiTags('TeamsBot')
export class TeamsbotController {
    constructor(private readonly teamsBotService: TeamsbotService) {}

    loginURL = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${process.env.AZURE_CLIENT_ID ?? ''}&response_type=code&redirect_uri=${process.env.TEAMS_BOT_REDIRECT_URI ?? ''}&response_mode=query
&scope=openid%20profile%20email%20offline_access%20OnlineMeetings.ReadWrite%20OnlineMeetingTranscript.Read.All
&state=12345`;

    @Get('login')
    async login(@Res() res: Response) {
        // console.log("Login URL:", this.loginURL);
        // Redirect to this URL to initiate the OAuth flow
        return res.redirect(this.loginURL);
    }

    @Get('redirect')
    async handleRedirect(@Query('code') code: string) {
        const tokenEndpoint = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
        const params = new URLSearchParams();
        params.append('client_id', process.env.AZURE_CLIENT_ID ?? '');
        params.append('client_secret', process.env.AZURE_CLIENT_SECRET ?? '');
        params.append('code', code);
        params.append('redirect_uri', process.env.TEAMS_BOT_REDIRECT_URI ?? ''); // Must match what you registered
        params.append('grant_type', 'authorization_code');

        const response = await axios.post(tokenEndpoint, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        console.log('Access token response:', response.data.access_token);

        return { token: response.data.access_token }; // Contains access_token, refresh_token, expires_in, etc.
    }

    // @Post('messages')
    // @ApiExcludeEndpoint()
    // async postMessage(@Req() req: any, @Res() res: any,) {
    //   console.log("Bot message received")
    //   if(req.body["@odata.type"]){
    //     await this.teamsBotService.processMessages(req.body);
    //   }else{
    //     await this.teamsBotService.handleIncomingMessage(req, res);
    //   }
    // }

    // @Post('calling')
    // @ApiExcludeEndpoint()
    // async teamsCalling(@Req() req: any, @Res() res: any,) {
    //   console.log("Bot call received")
    //   if(req.body["@odata.type"]){
    //     await this.teamsBotService.processMessages(req.body);
    //   }else{
    //     await this.teamsBotService.handleIncomingMessage(req, res);
    //   }
    // }

    // @Post('callback')
    // async handleCallEvents(
    //     @Query('validationToken') validationToken: string,
    //     @Req() req: Request,
    //     @Res() res: Response,
    // ) {
    //     if (validationToken) {
    //         console.log('Validation request received');
    //         return res.status(200).send(validationToken); // Respond with the validation token
    //     }

    //     // Handle call events
    //     const event = req.body;
    //     const result = await this.teamsBotService.processCallEvents(event)
    //     return res.status(200).send(result);
    // }

    // @Post('redirect')
    // @ApiExcludeEndpoint()
    // async azureCallBack(@Req() req: Request, @Res() res: Response) {
    //     const token=req.body['id_token'];
    //     console.log("request body", token)

    //     try {
    //         const decodedToken: any = jwt.decode(token);
    //         return res.redirect(`https://sibasi.com/`);
    //         } catch (error) {
    //         console.error(error, 'Error');
    //         return res.status(500).send(error);
    //     }
    // }

    // @Post('joinMeeting/:joinMeetingId/:meetingPasscode')
    // @ApiParam({ name: 'joinMeetingId', type: String, description: 'The join meeting ID of the meeting'})
    // @ApiParam({ name: 'meetingPasscode', type: String, description: 'The meeting passcode of the meeting'})
    // async joinMeeting(@Param('joinMeetingId') joinMeetingId: string, @Param('meetingPasscode') meetingPasscode: string) {
    //     const response = await this.teamsBotService.joinGroupCall(TEAMS_BOT_TENANT_ID, joinMeetingId, meetingPasscode, TEAMS_BOT_CALLBACK_URI);
    //     return response;
    // }

    // @Post('leaveCall/:callId')
    // @ApiParam({ name: 'callId', type: String, description: 'The ID of the call to leave' })
    // async leaveMeeting(@Param('callId') callId: string) {
    //     try {
    //         const accessToken = await getCallToken(TEAMS_BOT_TENANT_ID);
    //         await this.teamsBotService.leaveCall(callId, accessToken);
    //         return { success: true, message: 'Bot has left the call successfully' };
    //     } catch (error) {
    //         console.error('Error leaving call:', error);
    //         throw new Error('Failed to leave the call');
    //     }
    // }

    // @Get("transcript/:meetingId")
    // @ApiParam({ name: 'meetingId', type: String, description: 'The ID of the meeting' })
    // async getTranscriptController(@Param('meetingId') meetingId: string, @Query('userToken') userToken: string) {
    //     console.log("Getting transcript")
    //     const transcript = await getTranscript(meetingId, userToken);
    //     console.log("Done getting transcript")
    //     return transcript;
    // }

    // @Get('teamstoken')
    // async getOnBehalfOfToken(@Query('userToken') userToken: string) {
    //     console.log("Getting token")
    //     const url = `https://login.microsoftonline.com/${TEAMS_BOT_TENANT_ID}/oauth2/v2.0/token`;
    //     const formData = new URLSearchParams();
    //     formData.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    //     formData.append('client_id', process.env.AZURE_CLIENT_ID ?? '');
    //     formData.append('scope', 'api://a8f0683a-6bfe-4a9b-9247-bb872f3c2b26/user_impersonation');
    //     formData.append('client_secret', process.env.AZURE_CLIENT_SECRET ?? '');
    //     formData.append('assertion', userToken)
    //     formData.append('requested_token_use', 'on_behalf_of')

    //     try {
    //       const response = await axios.post(url, formData.toString(), {
    //         headers: {
    //           'Content-Type': 'application/x-www-form-urlencoded',
    //         },
    //       });
    //       console.log("Token received")
    //       return response.data;
    //     } catch (error) {
    //       console.error('Error in getting token:', error.response.data);
    //       console.error('Request setup error:', error.message);
    //     }
    // }
}
