/**
 * This file defines the `TicTacToe` smart contract and the helpers it needs.
 */

import {
  Field,
  State,
  PublicKey,
  SmartContract,
  state,
  method,
  Bool,
  UInt32,
  Provable,
  Signature,
  Struct,
  Experimental
} from 'o1js';

import { Board } from './game2048.js'

const { OffchainState, OffchainStateCommitments } = Experimental;

export { Board, Offchain2048, offchainState };

const BOARD_ROWS = 4
const BOARD_COLS = 4
const NUM_BITS = 5

const offchainState = OffchainState({
  // The board is serialized as a single field element
  board: OffchainState.Map(PublicKey, Field),
  maxScore: OffchainState.Map(PublicKey, UInt32),
  gameCount: OffchainState.Map(PublicKey, UInt32),
});

class StateProof extends offchainState.Proof {}

class Offchain2048 extends SmartContract {
  @state(OffchainStateCommitments) offchainState = State(
    OffchainStateCommitments.empty()
  );

  @method
  async settle(proof: StateProof) {
    await offchainState.settle(proof);
  }

  @method
  async resetGame(player: PublicKey, signature: Signature) {
    // ensure player owns the associated private key
    signature.verify(player, [Field(0)]).assertTrue();

    let boardOption = await offchainState.fields.board.get(player);
    let boardRaw = boardOption.orElse(0n);
    let board = new Board(boardRaw)

    let maxScoreOption = await offchainState.fields.maxScore.get(player);
    let maxScore = maxScoreOption.orElse(0n);
    let maxScoreNew = Provable.if(
      board.score.greaterThan(maxScore),
      board.score,
      maxScore,
    )

    let gameCountOption = await offchainState.fields.gameCount.get(player);
    let gameCount = gameCountOption.orElse(0n);
    let gameCountNew = Provable.if(
      boardRaw.equals(0n),
      gameCount,
      gameCount.add(1),
    )

    // update score and game count
    offchainState.fields.maxScore.overwrite(player, maxScoreNew)
    offchainState.fields.gameCount.overwrite(player, gameCountNew)

    // reset board
    offchainState.fields.board.overwrite(player, 0n)
  }

  async assertSignature(
    player: PublicKey,
    signature: Signature,
    action: Field,
    value: Field,
  ) {
    let boardOption = await offchainState.fields.board.get(player);
    boardOption.isSome.assertTrue();

    let boardRaw = boardOption.orElse(0n);
    let board = new Board(boardRaw)

    // 1. if the game is already finished, abort.
    board.ended.assertFalse()

    // 2. ensure that we know the private key associated to the public key
    //    and that our public key is known to the zkApp

    // ensure player owns the associated private key
    signature.verify(player, [action, value]).assertTrue();

    return board
  }

  @method async addTile(
    player: PublicKey,
    signature: Signature,
    r: Field,
    c: Field,
  ) {
    const board = await this.assertSignature(
      player,
      signature,
      Field(2),
      r.mul(Field(BOARD_COLS)).add(c)
    )
    const oldBoard = board.serialize()

    board.newTile(r, c, UInt32.one)

    await offchainState.fields.board.update(player, {
      from: oldBoard,
      to: board.serialize(),
    })
  }

  @method async moveUp(
    player: PublicKey,
    signature: Signature,
  ) {
    const board = await this.assertSignature(
      player,
      signature,
      Field(1),
      Field(0)
    )
    const oldBoard = board.serialize()

    board.moveUp()

    await offchainState.fields.board.update(player, {
      from: oldBoard,
      to: board.serialize(),
    })
  }

  @method async moveDown(
    player: PublicKey,
    signature: Signature,
  ) {
    const board = await this.assertSignature(
      player,
      signature,
      Field(1),
      Field(1)
    )
    const oldBoard = board.serialize()

    board.moveDown()

    await offchainState.fields.board.update(player, {
      from: oldBoard,
      to: board.serialize(),
    })
  }

  @method async moveLeft(
    player: PublicKey,
    signature: Signature,
  ) {
    const board = await this.assertSignature(
      player,
      signature,
      Field(1),
      Field(2)
    )
    const oldBoard = board.serialize()

    board.moveLeft()

    await offchainState.fields.board.update(player, {
      from: oldBoard,
      to: board.serialize(),
    })
  }

  @method async moveRight(
    player: PublicKey,
    signature: Signature,
  ) {
    const board = await this.assertSignature(
      player,
      signature,
      Field(1),
      Field(3)
    )
    const oldBoard = board.serialize()

    board.moveRight()

    await offchainState.fields.board.update(player, {
      from: oldBoard,
      to: board.serialize(),
    })
  }
}
