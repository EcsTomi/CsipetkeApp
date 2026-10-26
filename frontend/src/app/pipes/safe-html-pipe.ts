import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import DOMPurify from 'dompurify';

@Pipe({
  name: 'safeHtml',
  standalone: true // vagy add hozzá a @NgModule declarations-höz, ha régebbi projektet használsz
})
export class SafeHtmlPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string): SafeHtml {
    if (!value) {
      return this.sanitizer.bypassSecurityTrustHtml('');
    }

    // Konfiguráció: engedélyezzük az inline style attribútumot
    const cleanHtml = DOMPurify.sanitize(value, {
      ALLOWED_ATTR: ['style'],
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'span', 'u', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3']
    });

    // Az Angular felé jelezzük, hogy ez a megtisztított HTML már biztonságos
    return this.sanitizer.bypassSecurityTrustHtml(cleanHtml);
  }
}

@Pipe({
  name: 'safeHtmlEllipsis',
  standalone: true // vagy add hozzá a @NgModule declarations-höz, ha régebbi projektet használsz
})
export class SafeHtmlEllipsisPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string): SafeHtml {
    if (!value) {
      return this.sanitizer.bypassSecurityTrustHtml('');
    }
    const limit = 100;

    // Regex, ami elkülöníti a HTML tag-eket a sima szövegtől
    const tagOrTextRegex = /(<[^>]+>|[^< ]+)/g;
    const tokens = value.match(tagOrTextRegex) || [];

    let resultLength = 0;
    let result = '';
    let ellipsis = false;

    for (const token of tokens) {
      if (token.startsWith('<')) {
        // Ez egy HTML tag, hozzáadjuk a végeredményhez, de nem számoljuk a karakterekbe
        result += token;
      } else {
        // Ez sima szöveg, itt számolnunk kell a karaktereket
        const remainingLength = limit - resultLength;

        if (token.length <= remainingLength) {
          result += token + ' ';
          resultLength += token.length + 1;
        } else {
          ellipsis = true;
          break; // Kilépünk, mert elértük a 100 karaktert
        }
      }
    }
    if (ellipsis) result += '...';

    // Konfiguráció: engedélyezzük az inline style attribútumot
    const cleanHtml = DOMPurify.sanitize(result, {
      ALLOWED_ATTR: ['style'],
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'span', 'u', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3']
    });

    // Az Angular felé jelezzük, hogy ez a megtisztított HTML már biztonságos
    return this.sanitizer.bypassSecurityTrustHtml(cleanHtml);
  }
}