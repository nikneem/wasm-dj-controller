import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SliderModule } from 'primeng/slider';
import { KnobComponent } from '../knob/knob.component';

export interface ChannelSettings {
    gain: number;
    highEq: number;
    midEq: number;
    lowEq: number;
    fader: number;
    volume: number;
}

@Component({
    selector: 'app-mixer',
    standalone: true,
    imports: [CommonModule, FormsModule, SliderModule, KnobComponent],
    templateUrl: './mixer.component.html',
    styleUrls: ['./mixer.component.scss']
})
export class MixerComponent {
    @Input() leftDeckSettings: ChannelSettings = {
        gain: 0,
        highEq: 0,
        midEq: 0,
        lowEq: 0,
        fader: 0,
        volume: 80
    };

    @Input() rightDeckSettings: ChannelSettings = {
        gain: 0,
        highEq: 0,
        midEq: 0,
        lowEq: 0,
        fader: 0,
        volume: 80
    };

    @Input() masterVolume: number = 80;
    @Input() crossFader: number = 0; // -100 (left) to +100 (right)

    @Output() leftDeckChange = new EventEmitter<ChannelSettings>();
    @Output() rightDeckChange = new EventEmitter<ChannelSettings>();
    @Output() masterVolumeChange = new EventEmitter<number>();
    @Output() crossFaderChange = new EventEmitter<number>();

    onLeftGainChange(value: number): void {
        this.leftDeckSettings.gain = value;
        this.leftDeckChange.emit(this.leftDeckSettings);
    }

    onLeftHighEqChange(value: number): void {
        this.leftDeckSettings.highEq = value;
        this.leftDeckChange.emit(this.leftDeckSettings);
    }

    onLeftMidEqChange(value: number): void {
        this.leftDeckSettings.midEq = value;
        this.leftDeckChange.emit(this.leftDeckSettings);
    }

    onLeftLowEqChange(value: number): void {
        this.leftDeckSettings.lowEq = value;
        this.leftDeckChange.emit(this.leftDeckSettings);
    }

    onLeftFaderChange(value: number): void {
        this.leftDeckSettings.fader = value;
        this.leftDeckChange.emit(this.leftDeckSettings);
    }

    onLeftVolumeChange(value: number): void {
        this.leftDeckSettings.volume = value;
        this.leftDeckChange.emit(this.leftDeckSettings);
    }

    onRightGainChange(value: number): void {
        this.rightDeckSettings.gain = value;
        this.rightDeckChange.emit(this.rightDeckSettings);
    }

    onRightHighEqChange(value: number): void {
        this.rightDeckSettings.highEq = value;
        this.rightDeckChange.emit(this.rightDeckSettings);
    }

    onRightMidEqChange(value: number): void {
        this.rightDeckSettings.midEq = value;
        this.rightDeckChange.emit(this.rightDeckSettings);
    }

    onRightLowEqChange(value: number): void {
        this.rightDeckSettings.lowEq = value;
        this.rightDeckChange.emit(this.rightDeckSettings);
    }

    onRightFaderChange(value: number): void {
        this.rightDeckSettings.fader = value;
        this.rightDeckChange.emit(this.rightDeckSettings);
    }

    onRightVolumeChange(value: number): void {
        this.rightDeckSettings.volume = value;
        this.rightDeckChange.emit(this.rightDeckSettings);
    }

    onMasterVolumeChange(value: number): void {
        this.masterVolume = value;
        this.masterVolumeChange.emit(this.masterVolume);
    }

    onCrossFaderChange(value: number): void {
        this.crossFader = value;
        this.crossFaderChange.emit(this.crossFader);
    }

    getCrossFaderAbs(value: number): number {
        return Math.abs(value);
    }
}
