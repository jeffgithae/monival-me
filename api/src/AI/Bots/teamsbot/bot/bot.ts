import { TeamsActivityHandler, TurnContext } from 'botbuilder';

export class Bot extends TeamsActivityHandler {
    constructor() {
        super();

        // Handles the 'MembersAdded' event (like when the user first opens the chat)
        this.onMembersAdded(async (context, next) => {
            const welcomeText = 'Hello, I am a bot residing in the eBoard realm. My current version is 2.5';
            await context.sendActivity(welcomeText);
            await next();
        });

        // Handles user messages
        this.onMessage(async (context, next) => {
            const userMessage = context.activity.text;
            console.log('Message received: ', userMessage);
            const welcomeText = 'Hello, I am a bot residing in the eBoard AI realm. Version 3.0';
            await context.sendActivity(welcomeText);
            await next();
        });
    }
}
