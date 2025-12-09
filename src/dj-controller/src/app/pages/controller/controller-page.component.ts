import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DeckComponent } from '../../components/deck/deck.component';

@Component({
    selector: 'app-controller-page',
    standalone: true,
    imports: [CommonModule, FormsModule, DeckComponent],
    templateUrl: './controller-page.component.html',
    styleUrls: ['./controller-page.component.scss']
})
export class ControllerPageComponent {
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

    // Center mixer state
    masterVolume = 0;
    crossfaderPosition = 0;
    upcomingBPM = 0;
    isConnected = true;
}
