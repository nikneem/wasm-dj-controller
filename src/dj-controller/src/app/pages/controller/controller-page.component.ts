import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DeckComponent } from '../../components/deck/deck.component';
import { MixerComponent, ChannelSettings } from '../../components/mixer/mixer.component';

@Component({
    selector: 'app-controller-page',
    standalone: true,
    imports: [CommonModule, FormsModule, DeckComponent, MixerComponent],
    templateUrl: './controller-page.component.html',
    styleUrls: ['./controller-page.component.scss']
})
export class ControllerPageComponent {
    @ViewChild('leftDeckComponent') leftDeckComponent!: DeckComponent;
    @ViewChild('rightDeckComponent') rightDeckComponent!: DeckComponent;

    // Left deck state
    leftDeck = {
        number: 1,
        side: 'left' as const
    };

    // Right deck state
    rightDeck = {
        number: 2,
        side: 'right' as const
    };

    // Mixer state
    leftChannelSettings: ChannelSettings = {
        gain: 0,
        highEq: 0,
        midEq: 0,
        lowEq: 0,
        fader: 0,
        volume: 80
    };

    rightChannelSettings: ChannelSettings = {
        gain: 0,
        highEq: 0,
        midEq: 0,
        lowEq: 0,
        fader: 0,
        volume: 80
    };

    crossFader = 0;

    onLeftChannelChange(settings: ChannelSettings): void {
        console.log('[Controller] Left channel updated:', settings);
        if (this.leftDeckComponent?.audioEngineService) {
            const service = this.leftDeckComponent.audioEngineService;
            service.setChannelGain(settings.gain);
            service.setHighEq(settings.highEq);
            service.setMidEq(settings.midEq);
            service.setLowEq(settings.lowEq);
            service.setPan(settings.fader);
            service.setChannelVolume(settings.volume);
            service.setCrossFader(this.crossFader, true); // true = left deck
        }
    }

    onRightChannelChange(settings: ChannelSettings): void {
        console.log('[Controller] Right channel updated:', settings);
        if (this.rightDeckComponent?.audioEngineService) {
            const service = this.rightDeckComponent.audioEngineService;
            service.setChannelGain(settings.gain);
            service.setHighEq(settings.highEq);
            service.setMidEq(settings.midEq);
            service.setLowEq(settings.lowEq);
            service.setPan(settings.fader);
            service.setChannelVolume(settings.volume);
            service.setCrossFader(this.crossFader, false); // false = right deck
        }
    }

    onCrossFaderChange(value: number): void {
        console.log('[Controller] Cross fader:', value);
        // Apply cross fader to both decks
        if (this.leftDeckComponent?.audioEngineService) {
            this.leftDeckComponent.audioEngineService.setCrossFader(value, true);
        }
        if (this.rightDeckComponent?.audioEngineService) {
            this.rightDeckComponent.audioEngineService.setCrossFader(value, false);
        }
    }
}
