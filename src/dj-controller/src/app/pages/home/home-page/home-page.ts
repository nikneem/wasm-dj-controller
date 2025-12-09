import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'dj-home-page',
  imports: [
    CommonModule,
    RouterModule,
    ButtonModule,
    CardModule
  ],
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
})
export class HomePage {
  features = [
    {
      icon: 'pi pi-bolt',
      title: 'Real-Time Processing',
      description: 'WebAssembly-powered audio engine delivers professional-grade performance with zero latency.'
    },
    {
      icon: 'pi pi-sliders-h',
      title: 'Advanced Controls',
      description: 'Tempo, pitch, EQ, and crossfader controls for seamless beat matching and mixing.'
    },
    {
      icon: 'pi pi-chart-line',
      title: 'BPM Detection',
      description: 'Automatic BPM and key detection helps you match tracks perfectly every time.'
    },
    {
      icon: 'pi pi-sync',
      title: 'Harmonic Mixing',
      description: 'Key detection and Camelot wheel integration for harmonically compatible transitions.'
    }
  ];

  stats = [
    { value: '<5ms', label: 'Audio Latency' },
    { value: '2 Decks', label: 'Simultaneous' },
    { value: '±50%', label: 'Tempo Range' },
    { value: '±12', label: 'Semitones' }
  ];
}
